import type DashboardController from "..";

declare global {
  var dashboard: {
    controller: DashboardController;
    ready: boolean;
  };
}

export { };
