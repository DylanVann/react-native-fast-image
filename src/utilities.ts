

export function findBorderRadius(style: unknown): number | undefined {
  if (Array.isArray(style)) {
      const obj = style.find((s) => {
        const borderRadius = findBorderRadius(s)
        return borderRadius != null && borderRadius > 0
      });
      return obj?.borderRadius;
    } else {
      // @ts-expect-error typings for StyleProp<> are really hard
      return style?.borderRadius;
    }
}
