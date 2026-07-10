export function getManagerClient(wuId: string) {
  return global.manager.clients.values().find(client => client.waiterUserId === wuId);
}