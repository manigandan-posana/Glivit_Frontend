import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeviceCreateForm } from '@/src/components/DeviceCreateForm';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Chip, EmptyLine, RowCard } from '@/src/components/ui/ModulePrimitives';
import { TextField } from '@/src/components/ui/TextField';
import { P } from '@/src/constants/permissions';
import { apiErrorMessage } from '@/src/services/apiError';
import {
  useCreateGroupMutation,
  useCreateProjectMutation,
  useCreateUserMutation,
  useGetAuditQuery,
  useGetGroupsQuery,
  useGetProjectsQuery,
  useGetUsersQuery,
} from '@/src/services/operationsApi';
import { useHasPermission } from '@/src/store/hooks';
import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typography, type ThemeColors } from '@/src/theme/tokens';

/**
 * Management module.
 *
 * There is deliberately no Drivers tab: a driver IS a user with the DRIVER
 * role, so the whole driver lifecycle (create, list, contact details) lives in
 * the Users tab. Saving a user with the DRIVER role provisions that user's
 * driver record on the backend, which is what vehicle assignment and driver
 * scoring read from.
 */
type Tab = 'devices' | 'users' | 'projects' | 'groups' | 'audit';
type UserRole = 'ADMIN' | 'DRIVER';
type NewUserDraft = {
  name: string;
  username: string;
  password: string;
  mobile: string;
  role: UserRole;
};

const EMPTY_USER: NewUserDraft = {
  name: '',
  username: '',
  password: '',
  mobile: '',
  role: 'ADMIN',
};

export default function ManagementScreen() {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const canDevices = useHasPermission(P.CREATE_DEVICE);
  const canUsers = useHasPermission(P.MANAGE_USERS);
  const canProjects = useHasPermission(P.MANAGE_PROJECTS);
  const canGroups = useHasPermission(P.MANAGE_GROUPS);
  const canAudit = useHasPermission(P.VIEW_AUDIT_LOGS);
  const availableTabs = React.useMemo(
    () =>
      [
        canDevices && 'devices',
        canUsers && 'users',
        canProjects && 'projects',
        canGroups && 'groups',
        canAudit && 'audit',
      ].filter(Boolean) as Tab[],
    [canAudit, canDevices, canGroups, canProjects, canUsers]
  );
  const [tab, setTab] = React.useState<Tab>(availableTabs[0] ?? 'devices');

  const projects = useGetProjectsQuery(undefined, { skip: !canProjects });
  const groups = useGetGroupsQuery(undefined, { skip: !canGroups });
  const users = useGetUsersQuery({ size: 50 }, { skip: !canUsers });
  const audit = useGetAuditQuery({ size: 50 }, { skip: !canAudit });

  const [createProject, projectState] = useCreateProjectMutation();
  const [createGroup, groupState] = useCreateGroupMutation();
  const [createUser, userState] = useCreateUserMutation();

  const [projectName, setProjectName] = React.useState('');
  const [groupName, setGroupName] = React.useState('');
  const [newUser, setNewUser] = React.useState<NewUserDraft>(EMPTY_USER);

  const refreshing =
    (canProjects && projects.isFetching) ||
    (canGroups && groups.isFetching) ||
    (canUsers && users.isFetching) ||
    (canAudit && audit.isFetching);

  const refreshAll = React.useCallback(() => {
    if (canProjects) void projects.refetch();
    if (canGroups) void groups.refetch();
    if (canUsers) void users.refetch();
    if (canAudit) void audit.refetch();
    // The query objects are recreated on every render; the refetch functions on
    // them are stable, so intentionally depend on the permission flags only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAudit, canGroups, canProjects, canUsers]);

  const submitProject = async () => {
    try {
      await createProject({ name: projectName.trim(), status: 'ACTIVE' }).unwrap();
      setProjectName('');
    } catch (err) {
      Alert.alert('Project not saved', apiErrorMessage(err));
    }
  };

  const submitGroup = async () => {
    try {
      await createGroup({ name: groupName.trim() }).unwrap();
      setGroupName('');
    } catch (err) {
      Alert.alert('Group not saved', apiErrorMessage(err));
    }
  };

  const submitUser = async () => {
    const isDriver = newUser.role === 'DRIVER';
    try {
      await createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        name: newUser.name.trim(),
        // A driver's phone number is how dispatch reaches them, so it is carried
        // on the user record and copied onto the provisioned driver record.
        ...(newUser.mobile.trim() ? { mobile: newUser.mobile.trim() } : {}),
        role: newUser.role,
        status: 'ACTIVE',
        permissions: {},
      }).unwrap();
      setNewUser(EMPTY_USER);
      Alert.alert(
        isDriver ? 'Driver created' : 'User created',
        isDriver
          ? `${newUser.name.trim()} can sign in as a driver and be assigned to vehicles.`
          : `${newUser.name.trim()} can now sign in.`
      );
    } catch (err) {
      Alert.alert(isDriver ? 'Driver not saved' : 'User not saved', apiErrorMessage(err));
    }
  };

  if (availableTabs.length === 0) {
    return <EmptyLine text="No management modules are available for this account." />;
  }

  return (
    <ScrollView
      // The background belongs on the ScrollView itself, not only on the content
      // container: the container is only as tall as its children, so in dark mode
      // everything below the last card fell through to the default white
      // backdrop. `flexGrow` makes the content fill the viewport as well.
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      refreshControl={
        <RefreshControl onRefresh={refreshAll} refreshing={Boolean(refreshing)} tintColor={c.primary} />
      }
      style={styles.screen}>
      <View style={styles.tabRow}>
        {availableTabs.map((value) => (
          <Chip key={value} active={tab === value} label={label(value)} onPress={() => setTab(value)} />
        ))}
      </View>

      {tab === 'devices' && canDevices ? <DeviceCreateForm /> : null}

      {tab === 'users' && canUsers ? (
        <Section
          buttonLabel={newUser.role === 'DRIVER' ? 'Create driver' : 'Create user'}
          loading={userState.isLoading}
          onSubmit={submitUser}
          submitDisabled={
            !newUser.name.trim() || !newUser.username.trim() || newUser.password.length < 8
          }
          title="Users & Drivers">
          <Text style={styles.sectionHint}>
            Choose the Driver role to create a driver account. Drivers get a login and a driver
            record that can be assigned to vehicles — there is no separate Drivers module.
          </Text>
          <TextField
            label="Full name"
            onChangeText={(name) => setNewUser((v) => ({ ...v, name }))}
            value={newUser.name}
          />
          <TextField
            autoCapitalize="none"
            label="Username"
            onChangeText={(username) => setNewUser((v) => ({ ...v, username }))}
            value={newUser.username}
          />
          <TextField
            label="Password"
            onChangeText={(password) => setNewUser((v) => ({ ...v, password }))}
            secure
            value={newUser.password}
          />
          <TextField
            keyboardType="phone-pad"
            label={newUser.role === 'DRIVER' ? 'Phone number' : 'Phone number (optional)'}
            onChangeText={(mobile) => setNewUser((v) => ({ ...v, mobile }))}
            value={newUser.mobile}
          />
          <View style={styles.categoryRow}>
            {(['ADMIN', 'DRIVER'] as const).map((role) => (
              <Chip
                key={role}
                active={newUser.role === role}
                label={role === 'DRIVER' ? 'Driver' : 'Admin'}
                onPress={() => setNewUser((v) => ({ ...v, role }))}
              />
            ))}
          </View>

          <ListState
            emptyText="No users yet."
            error={users.error}
            isError={users.isError}
            isLoading={users.isLoading}
            isEmpty={(users.data?.content.length ?? 0) === 0}
            onRetry={users.refetch}
            styles={styles}
            tint={c.primary}
          />
          {users.data?.content.map((user) => (
            <RowCard
              key={user.id}
              icon={user.role === 'DRIVER' ? 'card-account-details-outline' : 'account-outline'}
              title={user.name}
              meta={`${user.username} | ${user.role === 'DRIVER' ? 'Driver' : user.role} | ${user.status}${
                user.mobile ? ` | ${user.mobile}` : ''
              }`}
            />
          )) ?? null}
        </Section>
      ) : null}

      {tab === 'projects' && canProjects ? (
        <Section
          buttonLabel="Create project"
          loading={projectState.isLoading}
          onSubmit={submitProject}
          submitDisabled={!projectName.trim()}
          title="Projects">
          <TextField label="Project name" onChangeText={setProjectName} value={projectName} />
          <ListState
            emptyText="No projects yet."
            error={projects.error}
            isError={projects.isError}
            isLoading={projects.isLoading}
            isEmpty={(projects.data?.length ?? 0) === 0}
            onRetry={projects.refetch}
            styles={styles}
            tint={c.primary}
          />
          {projects.data?.map((project) => (
            <RowCard key={project.id} icon="folder-outline" title={project.name} meta={project.status} />
          )) ?? null}
        </Section>
      ) : null}

      {tab === 'groups' && canGroups ? (
        <Section
          buttonLabel="Create group"
          loading={groupState.isLoading}
          onSubmit={submitGroup}
          submitDisabled={!groupName.trim()}
          title="Groups">
          <TextField label="Group name" onChangeText={setGroupName} value={groupName} />
          <ListState
            emptyText="No groups yet."
            error={groups.error}
            isError={groups.isError}
            isLoading={groups.isLoading}
            isEmpty={(groups.data?.length ?? 0) === 0}
            onRetry={groups.refetch}
            styles={styles}
            tint={c.primary}
          />
          {groups.data?.map((group) => (
            <RowCard
              key={group.id}
              icon="shape-outline"
              title={group.name}
              meta={group.parentId ? `Parent #${group.parentId}` : 'Root group'}
            />
          )) ?? null}
        </Section>
      ) : null}

      {tab === 'audit' && canAudit ? (
        <Card style={styles.form}>
          <Text style={styles.title}>Audit Logs</Text>
          <ListState
            emptyText="No audit entries yet."
            error={audit.error}
            isError={audit.isError}
            isLoading={audit.isLoading}
            isEmpty={(audit.data?.content.length ?? 0) === 0}
            onRetry={audit.refetch}
            styles={styles}
            tint={c.primary}
          />
          {audit.data?.content.map((entry) => (
            <RowCard
              key={entry.id}
              icon="shield-search"
              title={entry.action}
              meta={`${entry.username ?? 'system'} | ${entry.entityType ?? ''} ${entry.entityId ?? ''}`}
            />
          )) ?? null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

/**
 * Inline loading / error / empty state for a list inside a management section.
 *
 * These lists previously rendered nothing at all when a request failed, so a
 * broken endpoint was indistinguishable from an empty tenant.
 */
function ListState({
  emptyText,
  error,
  isEmpty,
  isError,
  isLoading,
  onRetry,
  styles,
  tint,
}: {
  emptyText: string;
  error: unknown;
  isEmpty: boolean;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  styles: ReturnType<typeof makeStyles>;
  tint: string;
}) {
  if (isLoading) {
    return (
      <View style={styles.listState}>
        <ActivityIndicator color={tint} size="small" />
        <Text style={styles.listStateText}>Loading…</Text>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={styles.listState}>
        <MaterialCommunityIcons color={tint} name="alert-circle-outline" size={20} />
        <Text style={styles.listStateText}>{apiErrorMessage(error)}</Text>
        <Button label="Retry" icon="refresh" onPress={onRetry} variant="secondary" />
      </View>
    );
  }
  if (isEmpty) {
    return (
      <View style={styles.listState}>
        <Text style={styles.listStateText}>{emptyText}</Text>
      </View>
    );
  }
  return null;
}

function Section({
  title,
  children,
  buttonLabel,
  loading,
  submitDisabled,
  onSubmit,
}: {
  title: string;
  children: React.ReactNode;
  buttonLabel: string;
  loading: boolean;
  submitDisabled?: boolean;
  onSubmit: () => void;
}) {
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  return (
    <Card style={styles.form}>
      <Text style={styles.title}>{title}</Text>
      {children}
      <Button disabled={submitDisabled} label={buttonLabel} loading={loading} onPress={onSubmit} />
    </Card>
  );
}

function label(tab: Tab) {
  return tab.charAt(0).toUpperCase() + tab.slice(1);
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { backgroundColor: c.pageBackground, flex: 1 },
    content: {
      backgroundColor: c.pageBackground,
      flexGrow: 1,
      gap: spacing.md,
      padding: spacing.md,
    },
    tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    form: { gap: spacing.md },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    sectionHint: { color: c.textSecondary, fontSize: typography.caption, lineHeight: 17 },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    listState: {
      alignItems: 'center',
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      gap: spacing.sm,
      justifyContent: 'center',
      minHeight: 72,
      padding: spacing.md,
    },
    listStateText: {
      color: c.textSecondary,
      fontSize: typography.caption,
      textAlign: 'center',
    },
  });
