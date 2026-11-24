import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GitHubReferralProps {
  variant?: "floating" | "inline";
  className?: string;
}

export function GitHubReferral({
  variant = "floating",
  className,
}: GitHubReferralProps) {
  const linkButton = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        variant === "floating" && "bg-card/90 shadow-sm backdrop-blur-md",
        className,
      )}
      render={
        <a
          href="https://github.com/sdrpsps/cranemail-files"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View CraneMail Files on GitHub"
        />
      }
      nativeButton={false}
    >
      <Star data-icon="inline-start" className="text-warning" />
      <span>GitHub</span>
    </Button>
  );

  if (variant === "inline") {
    return linkButton;
  }

  return (
    <aside className="fixed right-4 top-4 z-40 sm:right-6 sm:top-5">
      {linkButton}
    </aside>
  );
}
