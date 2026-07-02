// index.ts
import './src/polyfill'; // MUST BE LINE 1 - Runs before the Expo engine initializes!

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);