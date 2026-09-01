import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

/**
 * Watches every query and mutation the manager panel runs for a rejected
 * token, and ends the session once.
 *
 * Subscribing to the caches rather than to one page's `isError` is what makes
 * this a property of the panel instead of a habit each page has to remember.
 * The redirect carries a reason, because a bare login form the morning after
 * tells a coordinator nothing about why they are looking at it.
 */
export function useManagerSessionExpiry(): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearSession = useManagerSessionStore((state) => state.clearSession);

  useEffect(() => {
    let handled = false;

    const expire = () => {
      if (handled) return;
      handled = true;
      clearSession();
      navigate(routes.managerLogin, { replace: true, state: { reason: "expired" } });
    };

    const check = (error: unknown) => {
      if (error instanceof UnauthorizedManagerError) expire();
    };

    const unsubscribeQueries = queryClient
      .getQueryCache()
      .subscribe((event) => check(event.query.state.error));
    const unsubscribeMutations = queryClient
      .getMutationCache()
      .subscribe((event) => check(event.mutation?.state.error));

    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [navigate, queryClient, clearSession]);
}
