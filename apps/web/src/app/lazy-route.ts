export function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K): () => Promise<M[K]> {
  return async () => {
    try {
      const module = await load();
      return module[name];
    } catch {
      try {
        const module = await load();
        return module[name];
      } catch (error) {
        window.location.reload();
        throw error;
      }
    }
  };
}
