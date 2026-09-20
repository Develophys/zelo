import { redirect } from "react-router";

interface RequireSessionOptions<Profile> {
  loginRoute: string;
  isLoggedIn: () => boolean;
  confirm: () => Promise<Profile>;
  isRejected: (error: unknown) => boolean;
  onConfirmed: (profile: Profile) => void;
  onRejected: () => void;
}

export function requireSession<Profile>(options: RequireSessionOptions<Profile>) {
  return async (): Promise<Response | null> => {
    if (options.isLoggedIn()) {
      void options
        .confirm()
        .then(options.onConfirmed)
        .catch((error: unknown) => {
          if (options.isRejected(error)) options.onRejected();
        });
      return null;
    }

    try {
      options.onConfirmed(await options.confirm());
      return null;
    } catch (error) {
      if (options.isRejected(error)) return redirect(options.loginRoute);
      throw error;
    }
  };
}
