import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Check, Share, MoreVertical } from "lucide-react";
import { Link } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone PWA on Android/Desktop or iOS Safari)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-ignore - iOS Safari only
      window.navigator.standalone === true ||
      document.referrer.startsWith("android-app://");
    if (isStandalone) {
      setIsInstalled(true);
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isIOSDevice);

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Listen for successful installation
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">App Installed!</CardTitle>
            <CardDescription>
              BarberPro is now installed on your device. You can access it from your home screen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/">
              <Button className="w-full">Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Smartphone className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">Install BarberPro</CardTitle>
          <CardDescription>
            Install our app for a better experience with offline access and quick booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {deferredPrompt ? (
            <Button onClick={handleInstall} className="w-full" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Install App
            </Button>
          ) : isIOS ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                To install on iOS:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Tap the</span>
                    <Share className="h-5 w-5" />
                    <span>Share button</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <span>Scroll down and tap "Add to Home Screen"</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                    3
                  </div>
                  <span>Tap "Add" to confirm</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                To install on Android:
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                    1
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Tap the</span>
                    <MoreVertical className="h-5 w-5" />
                    <span>menu button</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-medium">
                    2
                  </div>
                  <span>Tap "Install app" or "Add to Home screen"</span>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t">
            <h4 className="font-medium mb-3">Benefits of installing:</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Quick access from your home screen
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Works offline
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Faster loading times
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                Full-screen experience
              </li>
            </ul>
          </div>

          <Link to="/" className="block">
            <Button variant="outline" className="w-full">
              Continue in Browser
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default Install;
