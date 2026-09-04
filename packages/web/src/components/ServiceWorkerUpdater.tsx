import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

declare global {
    interface Window {
        __simulateSWUpdate?: () => void;
    }
}

export function ServiceWorkerUpdater(): React.ReactNode {
    const registrationRef = useRef<ServiceWorkerRegistration | undefined>(
        undefined
    );
    const [dismissed, setDismissed] = useState(false);
    const [simulatedUpdate, setSimulatedUpdate] = useState(false);
    const location = useLocation();

    const {
        needRefresh: [needRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        immediate: true,
        onRegisteredSW(_url, registration) {
            registrationRef.current = registration;
        },
        onRegisterError(error) {
            console.warn('SW registration failed:', error);
        },
    });

    const checkForUpdate = useCallback((): void => {
        registrationRef.current?.update();
    }, []);

    // Dev: expose window.__simulateSWUpdate() for local testing
    useEffect(() => {
        if (import.meta.env.DEV) {
            window.__simulateSWUpdate = () => {
                setSimulatedUpdate(true);
                setDismissed(false);
                console.log('SW update simulated — toast should appear');
            };
            return () => {
                delete window.__simulateSWUpdate;
            };
        }
    }, []);

    // Visibility change: check for updates when app returns to foreground
    useEffect(() => {
        function onVisibilityChange(): void {
            if (document.visibilityState === 'visible') {
                checkForUpdate();
                setDismissed(false);
            }
        }
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () =>
            document.removeEventListener(
                'visibilitychange',
                onVisibilityChange
            );
    }, [checkForUpdate]);

    // Route navigation: check for updates on path changes
    useEffect(() => {
        checkForUpdate();
        setDismissed(false);
    }, [location.pathname, checkForUpdate]);

    // 30-minute interval fallback
    useEffect(() => {
        const id = setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
        return () => clearInterval(id);
    }, [checkForUpdate]);

    const showSheet = (needRefresh || simulatedUpdate) && !dismissed;

    function handleUpdate(): void {
        if (simulatedUpdate && !needRefresh) {
            setSimulatedUpdate(false);
            window.location.reload();
        } else {
            updateServiceWorker(true);
        }
    }

    function handleDismiss(open: boolean): void {
        if (!open) {
            setDismissed(true);
        }
    }

    return (
        <Sheet open={showSheet} onOpenChange={handleDismiss}>
            <SheetContent side="bottom" className="rounded-t-xl">
                <SheetHeader className="items-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <RefreshCw className="h-6 w-6 text-primary" />
                    </div>
                    <SheetTitle>Update Available</SheetTitle>
                    <SheetDescription>
                        A new version of FarmStride is ready. Update now for the
                        latest features and fixes.
                    </SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-3 pt-4">
                    <Button
                        className="min-h-[44px] w-full"
                        onClick={handleUpdate}
                    >
                        Update Now
                    </Button>
                    <Button
                        variant="ghost"
                        className="min-h-[44px] w-full"
                        onClick={() => setDismissed(true)}
                    >
                        Not Now
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
