import {resolve} from 'node:path';
import {defineConfig} from '@playwright/test';
const port=Number(process.env.CAMPUS_QA_PORT||4580);
export default defineConfig({testDir:'./campus-browser',testMatch:'event-zone.spec.ts',workers:2,retries:0,reporter:'list',use:{baseURL:`http://127.0.0.1:${port}`,trace:'retain-on-failure'},projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],webServer:{cwd:resolve(__dirname,'..'),command:`CAMPUS_QA_PORT=${port} node tests/campus-fixture/server.mjs`,url:`http://127.0.0.1:${port}`,reuseExistingServer:true}});
