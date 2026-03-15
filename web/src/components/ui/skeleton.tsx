/** Skeleton loader component */

import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export const Skeleton = React.memo(function Skeleton({
  className = "",
  width,
  height,
  rounded = false,
}: SkeletonProps) {
  return (
    <div
      className={`skeleton ${rounded ? "!rounded-full" : ""} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
});
