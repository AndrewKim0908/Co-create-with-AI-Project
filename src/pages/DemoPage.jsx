import demoHtml from '../../Co-Create AI.html?raw';

export default function DemoPage() {
  return (
    <iframe
      title="Mockup Demo"
      srcDoc={demoHtml}
      style={{
        width: '100%',
        height: '100vh',
        border: 0,
        display: 'block',
        background: '#fff',
      }}
    />
  );
}
