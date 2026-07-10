const config: WaiterConfig = {
  discord: {
    serverId: "1234567891234567890",
  },

  publicUrl: "https://waiter.example.com",
  manager: {
    github: {
      token: "github_pat_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    }
  }
};

export default config satisfies WaiterConfig;