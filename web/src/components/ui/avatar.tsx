/** Initials avatar component */

import React from "react";
import type { EmailAddress } from "@/types/mail.ts";
import { getInitials, getAvatarColor } from "@/lib/format.ts";

interface AvatarProps {
  address: EmailAddress;
  size?: number;
  className?: string;
}

export const Avatar = React.memo(function Avatar({
  address,
  size = 36,
  className = "",
}: AvatarProps) {
  const initials = getInitials(address);
  const color = getAvatarColor(address.email);

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full text-white font-medium shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size * 0.4,
      }}
    >
      {initials}
    </div>
  );
});
