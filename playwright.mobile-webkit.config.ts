import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,projects:[{name:'mobile-webkit',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]});
