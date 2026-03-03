async function globalSetup() {
  const url = "http://localhost";
  const timeout = 60_000;
  const interval = 2_000;
  const start = Date.now();

  console.log(`Waiting for ${url} to be ready...`);

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`Server is ready (${Date.now() - start}ms)`);
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Server at ${url} did not respond within ${timeout}ms`);
}

export default globalSetup;
