import { render } from 'preact';
import { App } from './ui/App';
import { registerSW } from './ui/install';
import './style.css';

registerSW();
render(<App />, document.getElementById('app')!);
