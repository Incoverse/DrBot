const methodRegistry = new WeakMap<object, string[]>();
const handlers: Array<() => Promise<void> | void> = [];
let isShuttingDown = false;

export function onShutdown(target: any, propertyKey: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  const existing = methodRegistry.get(target) ?? [];
  methodRegistry.set(target, [...existing, propertyKey]);
  return descriptor;
}

export function registerShutdownInstance(instance: object): void {
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    const methods = methodRegistry.get(proto);
    if (methods) {
      for (const method of methods) {
        const fn = (instance as any)[method];
        if (typeof fn === "function") {
          handlers.push(fn.bind(instance));
        }
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
}

export async function runShutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Shutdown signal received. Running shutdown handlers...");

  const forceExit = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.warn("Shutdown timed out after 5s. Force exiting.");
      resolve();
    }, 5000).unref()
  );

  await Promise.race([
    Promise.allSettled(
      handlers.map((fn) => {
        try {
          return Promise.resolve(fn());
        } catch {
          return Promise.resolve();
        }
      })
    ),
    forceExit,
  ]);

  console.log("All shutdown handlers completed. Exiting.");
  process.exit(0);
}
