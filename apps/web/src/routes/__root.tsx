import { Toaster } from "@kiteline/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { PairScreen } from "@/components/pair-screen";
import { Offline, Splash } from "@/components/splash";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { initialPairToken, pair, useAuth } from "@/lib/auth";
import { setHome } from "@/lib/format";
import { orpc } from "@/lib/orpc";

import "../index.css";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "Kiteline" },
			{ name: "description", content: "Drive Claude Code on your computer from your phone." },
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<ThemeProvider defaultTheme="system">
				<AuthGate>
					<Outlet />
				</AuthGate>
				<ThemedToaster />
			</ThemeProvider>
		</>
	);
}

let pendingToken = initialPairToken;

function AuthGate({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const [pairing, setPairing] = useState(!!pendingToken);
	const [pairError, setPairError] = useState<string | null>(null);
	const auth = useAuth();

	useEffect(() => {
		const token = pendingToken;
		if (!token) return;
		pendingToken = null;
		void pair(token)
			.then((result) => {
				if (result.ok) queryClient.setQueryData(["auth"], { authed: true });
				else setPairError(result.error);
			})
			.catch(() => setPairError("Couldn't reach your computer to pair. Check that Kiteline is running."))
			.finally(() => setPairing(false));
	}, [queryClient]);

	if (pairing || auth.isLoading) return <Splash />;
	// Only when there's nothing to show: a failed background check mustn't wipe the page (and your draft).
	if (auth.isError && !auth.data) return <Offline onRetry={() => void auth.refetch()} />;
	if (!auth.data?.authed) return <PairScreen initialError={pairError} />;
	return <HomeSync>{children}</HomeSync>;
}

/** Paths render as ~/… once the server has said where home is. */
function HomeSync({ children }: { children: ReactNode }) {
	const system = useQuery(orpc.system.info.queryOptions({ staleTime: 5 * 60_000 }));
	if (system.data) setHome(system.data.home);
	return <>{children}</>;
}

function ThemedToaster() {
	const { resolved } = useTheme();
	return (
		<Toaster
			theme={resolved}
			position="top-center"
			offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
		/>
	);
}
