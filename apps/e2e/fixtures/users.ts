export function makeUser(tag: string) {
  const suffix = Date.now();
  return {
    email: `e2e-${tag}-${suffix}@test.local`,
    password: `TestPass!${suffix}`,
    displayName: `${tag}-${suffix}`,
  };
}
