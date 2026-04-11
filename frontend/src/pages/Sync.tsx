import {
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { IconPlugConnected, IconPlugConnectedX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, collectActiveTagIds } from "../api";
import { useAppState, useConfig, usePutConfig, useSyncSpoolman } from "../hooks";

type TestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok"; version?: string }
  | { status: "error"; message: string };

export default function SyncPage() {
  const { data } = useConfig();
  const put = usePutConfig();
  const { data: stateData } = useAppState();
  const syncSpoolman = useSyncSpoolman();
  const { t } = useTranslation();

  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const testSeq = useRef(0);

  const runTest = async () => {
    const seq = ++testSeq.current;
    setTestState({ status: "pending" });
    try {
      const { info } = await api.testSpoolman();
      if (seq !== testSeq.current) return;
      setTestState({ status: "ok", version: info.version });
    } catch {
      if (seq !== testSeq.current) return;
      setTestState({
        status: "error",
        message: t("sync.connection_card.test_error")
      });
    }
  };

  const savedUrl = data?.config.spoolman?.url ?? "";
  const [urlDraft, setUrlDraft] = useState(savedUrl);

  // Keep the draft in sync when the persisted config changes (e.g.
  // another tab saves, or the initial fetch resolves). We only adopt
  // the server value when the draft still matches the previously
  // saved value — otherwise the user is editing and we don't clobber.
  const [lastSeenSaved, setLastSeenSaved] = useState(savedUrl);
  useEffect(() => {
    if (urlDraft === lastSeenSaved) setUrlDraft(savedUrl);
    setLastSeenSaved(savedUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedUrl]);

  const urlDirty = urlDraft.trim() !== savedUrl;

  const saveUrl = async () => {
    if (!data) return;
    const trimmed = urlDraft.trim();
    if (trimmed === savedUrl) return; // nothing to save
    await put.mutateAsync({
      ...data.config,
      spoolman: {
        ...data.config.spoolman,
        url: trimmed === "" ? undefined : trimmed
      }
    });
    if (trimmed !== "") void runTest();
    else setTestState({ status: "idle" });
  };

  // Run a test once whenever a saved URL becomes available (initial
  // load, or switching from empty → configured). Changes to the saved
  // URL via Save trigger runTest() directly from the save handler.
  const testedUrl = useRef<string | null>(null);
  useEffect(() => {
    if (savedUrl && testedUrl.current !== savedUrl) {
      testedUrl.current = savedUrl;
      void runTest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedUrl]);

  const toggleAutoSync = async (value: boolean) => {
    if (!data) return;
    await put.mutateAsync({
      ...data.config,
      spoolman: {
        ...data.config.spoolman,
        auto_sync: value
      }
    });
    // Immediate sync on enable so users see status populate instantly
    // instead of waiting for the next MQTT push.
    if (value) syncSpoolman.mutate(stateData ? collectActiveTagIds(stateData) : []);
  };

  const toggleArchiveOnEmpty = async (value: boolean) => {
    if (!data) return;
    await put.mutateAsync({
      ...data.config,
      spoolman: {
        ...data.config.spoolman,
        archive_on_empty: value
      }
    });
  };

  const spoolmanConfigured = Boolean(savedUrl);
  const showSyncActions =
    spoolmanConfigured && !data?.config.spoolman?.auto_sync;

  return (
    <Stack gap="lg" maw={640}>
      <Title order={2}>{t("sync.title")}</Title>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="md">
          <Title order={4}>{t("sync.connection_card.title")}</Title>
          <Text size="sm" c="dimmed">
            {t("sync.connection_card.hint")}
          </Text>
          <Stack>
            <TextInput
              label={t("sync.connection_card.url")}
              placeholder="http://spoolman.local:7912"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlDirty) {
                  e.preventDefault();
                  void saveUrl();
                }
                if (e.key === "Escape") {
                  setUrlDraft(savedUrl);
                }
              }}
              rightSection={
                !urlDirty && testState.status !== "idle" ? (
                  testState.status === "pending" ? (
                    <Loader size={14} />
                  ) : testState.status === "ok" ? (
                    <Tooltip
                      label={t("sync.connection_card.test_ok", {
                        version: testState.version ?? "?"
                      })}
                    >
                      <IconPlugConnected
                        size={16}
                        color="var(--mantine-color-teal-6)"
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip label={testState.message} multiline maw={320}>
                      <IconPlugConnectedX
                        size={16}
                        color="var(--mantine-color-red-6)"
                      />
                    </Tooltip>
                  )
                ) : null
              }
            />
            <Group>
              <Button
                loading={put.isPending}
                onClick={() => void saveUrl()}
              >
                {t("common.save")}
              </Button>
            </Group>
            <Divider my="xs" />
            <Switch
              label={t("sync.connection_card.auto_sync")}
              description={t("sync.connection_card.auto_sync_hint")}
              checked={data?.config.spoolman?.auto_sync ?? false}
              onChange={(e) => void toggleAutoSync(e.currentTarget.checked)}
              disabled={!spoolmanConfigured || put.isPending}
            />
            <Switch
              label={t("sync.connection_card.archive_on_empty")}
              description={t("sync.connection_card.archive_on_empty_hint")}
              checked={data?.config.spoolman?.archive_on_empty ?? false}
              onChange={(e) =>
                void toggleArchiveOnEmpty(e.currentTarget.checked)
              }
              disabled={!spoolmanConfigured || put.isPending}
            />
          </Stack>
        </Stack>
      </Card>

      {showSyncActions && (
        <Card withBorder padding="lg" radius="md">
          <Stack gap="md">
            <Title order={4}>{t("sync.actions_card.title")}</Title>
            <Text size="sm" c="dimmed">
              {t("sync.actions_card.hint")}
            </Text>
            <Group>
              <Button
                loading={syncSpoolman.isPending}
                onClick={() => syncSpoolman.mutate(stateData ? collectActiveTagIds(stateData) : [])}
              >
                {t("sync.actions_card.sync_all")}
              </Button>
            </Group>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
