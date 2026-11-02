import { Toaster } from "@kiteline/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { DeviceWatch } from "@/components/device-watch";
import { PairScreen } from "@/components/pair-screen";
import { Offline, Splash } from "@/components/splash";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { initialPairLink, takePairLink, useAuth } from "@/lib/auth";
import { setHome } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { TunnelError } from "@/lib/relay";

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

function AuthGate({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	// A pairing link this page was opened with, or that came in later.
	const [link, setLink] = useState(initialPairLink);
	const auth = useAuth();

	// A link opened in a tab that already shows Kiteline only changes the #: take it from there too.
	useEffect(() => {
		const onHash = () => {
			const next = takePairLink();
			if (next) setLink(next);
		};
		window.addEventListener("hashchange", onHash);
		return () => window.removeEventListener("hashchange", onHash);
	}, []);

	const onPaired = useCallback(() => {
		setLink(null);
		queryClient.removeQueries({ queryKey: ["devices"] });
		void queryClient.invalidateQueries({ queryKey: ["auth"] });
	}, [queryClient]);

	if (link)
		return (
			<PairScreen
				link={link}
				onPaired={onPaired}
				onBack={auth.data?.authed ? () => setLink(null) : undefined}
			/>
		);
	if (auth.isLoading) return <Splash />;
	// Only when there's nothing to show: a failed background check mustn't wipe the page (and your draft).
	if (auth.isError && !auth.data)
		return <Offline onRetry={() => void auth.refetch()} reason={offlineReason(auth.error)} />;
	if (!auth.data?.authed) return <PairScreen stale={auth.data?.stale} onPaired={onPaired} />;
	return (
		<HomeSync>
			<DeviceWatch />
			{children}
		</HomeSync>
	);
}

/** Through the relay, the tunnel says exactly what's wrong; otherwise, the usual suspects. */
function offlineReason(error: unknown) {
	if (error instanceof TunnelError) return error.message;
	return "Check that Kiteline is still running there, and that this phone can reach it: the same Wi-Fi, or Tailscale.";
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
