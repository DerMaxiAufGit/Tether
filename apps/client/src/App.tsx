import { TETHER_VERSION } from "@tether/shared";

function App() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-cyan-400 tracking-tight">Tether</h1>
        <p className="mt-4 text-zinc-400 text-sm">v{TETHER_VERSION}</p>
      </div>
    </div>
  );
}

export default App;
