/** The SLING gift mark for generated images (icons, previews). Mirrors public/icon.svg. */
export function BrandMark({ size, radius = 8 / 28 }: { size: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28">
      <rect width="28" height="28" rx={28 * radius} fill="#16171A" />
      <path
        d="M14 11.2c-1.4-3.2-5.4-3.6-5.4-1.4s3.6 1.4 5.4 1.4zm0 0c1.4-3.2 5.4-3.6 5.4-1.4s-3.6 1.4-5.4 1.4z"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      <rect x="7.5" y="11.2" width="13" height="9.3" rx="2" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
      <path d="M14 11.2v9.3" stroke="#FFFFFF" strokeWidth="1.5" />
    </svg>
  );
}
