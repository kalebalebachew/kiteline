import { DeviceMobileIcon, DeviceTabletIcon, LaptopIcon } from "@phosphor-icons/react";

/** A phone, tablet or computer, going by the name a device gave itself. */
export function DeviceIcon({ name, className }: { name: string; className?: string }) {
	if (/iPad|tablet/i.test(name)) return <DeviceTabletIcon weight="fill" className={className} />;
	if (/\b(Mac|Windows PC|Linux computer|Chromebook)\b/.test(name))
		return <LaptopIcon weight="fill" className={className} />;
	return <DeviceMobileIcon weight="fill" className={className} />;
}
