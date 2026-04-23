import { useMediaQuery } from "@mantine/hooks";

export const MOBILE_QUERY = "(max-width: 48em)";

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY) ?? false;
}
