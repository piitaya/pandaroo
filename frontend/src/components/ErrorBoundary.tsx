import { Alert, Button, Stack } from "@mantine/core";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Stack p="xl" gap="md" maw={600}>
          <Alert color="red" title="Something went wrong">
            {this.state.error.message}
          </Alert>
          <Button.Group>
            <Button
              variant="default"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
            <Button
              variant="default"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          </Button.Group>
        </Stack>
      );
    }
    return this.props.children;
  }
}
