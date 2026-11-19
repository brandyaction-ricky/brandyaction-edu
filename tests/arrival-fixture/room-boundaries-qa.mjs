import {chromium, expect, webkit} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const url = new URL('/experience/moonshot', process.env.ARRIVAL_QA_URL || 'http://127.0.0.1:4604');
const output = process.env.ARRIVAL_QA_OUTPUT;
if (output) await mkdir(output, {recursive: true});

for (const [engine, mobile] of [[chromium, false], [webkit, true]]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({
      viewport: mobile ? {width: 393, height: 640} : {width: 1280, height: 820},
      isMobile: mobile, hasTouch: mobile,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00Z'));
    await page.addInitScript(() => {
      if (window !== window.top) return;
      localStorage.setItem('moonshot:arrival:synthetic-local-qa:v1', JSON.stringify({
        version: 1, step: 7, station: 7, officeStation: 7, entryStarted: true, spyPhase: 'handed-off', canonPhase: 3,
      }));
    });
    await page.route('**/welcome-walk.mjs', async route => {
      const response = await route.fetch();
      const render = 'renderer.render(scene, camera);';
      const source = await response.text();
      expect(source).toContain(render);
      await route.fulfill({response, body: source.replace(render, render + `
        window.measureFraming = (x, z) => {
          const point = new THREE.Vector3(x, 0, z).project(camera);
          const avatarCenter = new THREE.Vector3(state.x, .95, state.z).project(camera);
          return {
            x: (point.x + 1) * width / 2,
            y: (1 - point.y) * height / 2,
            avatarX: (avatarCenter.x + 1) * width / 2,
            distance: camera.position.distanceTo(figure.position),
            fogStart: scene.fog.near,
          };
        };
      `)});
    });

    await page.goto(url.href);
    const frame = page.frameLocator('iframe[title*="직원 사무실"]');
    const world = frame.locator('#walk');
    const floor = frame.locator('#floor');
    const controls = page.getByRole('region', {name: '웰컴 라운지에서 할 수 있는 일'});
    const press = target => mobile ? target.tap() : target.click();
    const positionX = async () => Number(await world.getAttribute('data-player-x'));
    const capture = stage => output && page.screenshot({path: resolve(output, engine.name() + '-' + stage + '.png')});
    async function holdUntil(key, predicate) {
      await page.keyboard.down(key);
      try {
        await expect.poll(predicate, {timeout: 16_000}).toBe(true);
      } finally {
        await page.keyboard.up(key);
      }
      await expect(world).toHaveAttribute('data-moving', 'false');
    }
    const measure = ([x, z]) => world.evaluate(
      (element, [px, pz]) => element.ownerDocument.defaultView.measureFraming(px, pz), [x, z],
    );

    await expect(world).toHaveAttribute('data-free-roam', 'true', {timeout: 20_000});
    await floor.focus();
    await holdUntil('ArrowRight', async () => await positionX() >= 42.54);
    const room = await floor.boundingBox();
    const controlsTop = (await controls.boundingBox()).y;
    await expect.poll(async () => {
      const {avatarX} = await measure([38, 0]);
      return avatarX > 22 && avatarX < room.width - 22;
    }).toBe(true);
    const walkable = await measure([38, 0]);
    // At the wall the projected room interior used to be off-screen on phones.
    expect(walkable.x).toBeGreaterThan(10);
    expect(walkable.x).toBeLessThan(room.width - 10);
    expect(walkable.y).toBeGreaterThan(10);
    expect(room.y + walkable.y).toBeLessThan(controlsTop);
    await capture('lounge-edge');
    if (mobile) await page.touchscreen.tap(room.x + walkable.x, room.y + walkable.y);
    else await page.mouse.click(room.x + walkable.x, room.y + walkable.y);
    await expect.poll(positionX).toBeLessThan(39);

    await press(controls.getByRole('button', {name: '복도로 돌아가기', exact: true}));
    await expect(world).toHaveAttribute('data-station', '4');
    await floor.focus();
    await holdUntil('ArrowLeft', async () => await positionX() <= -4.19);
    const corridor = await measure([0, 0]);
    // The old portrait camera pulled the avatar into the fog as the station got farther away.
    expect(corridor.distance).toBeLessThan(corridor.fogStart);
    await capture('corridor-left');
    await holdUntil('ArrowRight', async () => await positionX() > -3);
    expect(errors).toEqual([]);
    console.log(engine.name(), 'can return from the lounge edge and still see the corridor at its left limit');
  } finally {
    await browser.close();
  }
}
