import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface EmptyStateCardProps {
  title?: string;
  description: string;
  action?: {
    label: string;
    to?: string;
    state?: unknown;
    onClick?: () => void;
    icon?: ReactNode;
    variant?: string;
  };
}

export function EmptyStateCard({ title, description, action }: EmptyStateCardProps) {
  return (
    <Card withBorder padding="xl" radius="md">
      <Stack gap="md" align="center" ta="center">
        {title && <Title order={3}>{title}</Title>}
        <Text c="dimmed" maw={420}>
          {description}
        </Text>
        {action && (
          action.to ? (
            <Button
              component={Link}
              to={action.to}
              state={action.state}
              variant={action.variant ?? "filled"}
              leftSection={action.icon}
            >
              {action.label}
            </Button>
          ) : (
            <Button
              onClick={action.onClick}
              variant={action.variant ?? "filled"}
              leftSection={action.icon}
            >
              {action.label}
            </Button>
          )
        )}
      </Stack>
    </Card>
  );
}
