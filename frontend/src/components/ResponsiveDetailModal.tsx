import { Drawer, Modal } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

export function ResponsiveDetailModal({
  opened,
  onClose,
  title,
  children
}: {
  opened: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;

  const Container = isMobile ? Drawer : Modal;
  const containerProps = isMobile
    ? ({ position: "bottom", size: "90%" } as const)
    : ({ size: "lg", centered: true } as const);

  return (
    <Container
      opened={opened}
      onClose={onClose}
      title={title}
      {...containerProps}
    >
      {children}
    </Container>
  );
}
