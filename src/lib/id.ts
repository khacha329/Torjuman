// crypto.randomUUID() is secure-context only, and the tablet loads the app over
// plain http on the LAN. These IDs only need to be unique within one device's
// database, so a timestamp + counter + random suffix is plenty.

let counter = 0;

export function newId(prefix: string): string {
  counter = (counter + 1) % 0x10000;
  const time = Date.now().toString(36);
  const seq = counter.toString(36).padStart(3, '0');
  const rand = Math.floor(Math.random() * 0x10000).toString(36);
  return `${prefix}_${time}${seq}${rand}`;
}
