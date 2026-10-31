import { useEffect, useState } from 'preact/hooks';
import { Home } from './Home';
import { Editor } from './Editor';

const route = () => { const m = location.hash.match(/^#\/p\/([\w-]+)/); return m ? m[1] : null; };

export function App() {
  const [pid, setPid] = useState<string | null>(route());
  useEffect(() => { const f = () => setPid(route()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return pid
    ? <Editor key={pid} id={pid} back={() => { location.hash = ''; }} />
    : <Home open={(id) => { location.hash = `#/p/${id}`; }} />;
}
