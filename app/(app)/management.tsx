import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DeviceCreateForm } from '@/src/components/DeviceCreateForm';
import { Button } from '@/src/components/ui/Button';
import { Card } from '@/src/components/ui/Card';
import { Chip, EmptyLine, RowCard } from '@/src/components/ui/ModulePrimitives';
import { TextField } from '@/src/components/ui/TextField';
import { P } from '@/src/constants/permissions';
import { apiErrorMessage } from '@/src/services/apiError';
import {
  useCreateDriverMutation,
  useCreateGroupMutation,
  useCreateProjectMutation,
  useCreateUserMutation,
  useGetAuditQuery,
  useGetDriversQuery,
  useGetGroupsQuery,
  useGetProjectsQuery,
  useGetUsersQuery,
} from '@/src/services/operationsApi';
import { useHasPermission } from '@/src/store/hooks';
import { useTheme } from '@/src/theme/ThemeProvider';
import { spacing, typography, type ThemeColors } from '@/src/theme/tokens';

type Tab = 'devices' | 'users' | 'projects' | 'drivers' | 'groups' | 'audit';
type NewUserDraft = { name: string; username: string; password: string; role: 'ADMIN' | 'DRIVER' };

export default function ManagementScreen() {
  const { colors: c } = useTheme();
  const styles = React.useMemo(() => makeStyles(c), [c]);
  const canDevices = useHasPermission(P.CREATE_DEVICE);
  const canUsers = useHasPermission(P.MANAGE_USERS);
  const canProjects = useHasPermission(P.MANAGE_PROJECTS);
  const canDrivers = useHasPermission(P.MANAGE_DRIVERS);
  const canGroups = useHasPermission(P.MANAGE_GROUPS);
  const canAudit = useHasPermission(P.VIEW_AUDIT_LOGS);
  const availableTabs = [
    canDevices && 'devices',
    canUsers && 'users',
    canProjects && 'projects',
    canDrivers && 'drivers',
    canGroups && 'groups',
    canAudit && 'audit',
  ].filter(Boolean) as Tab[];
  const [tab, setTab] = React.useState<Tab>(availableTabs[0] ?? 'devices');

  const projects = useGetProjectsQuery(undefined, { skip: !canProjects });
  const drivers = useGetDriversQuery(undefined, { skip: !canDrivers });
  const groups = useGetGroupsQuery(undefined, { skip: !canGroups });
  const users = useGetUsersQuery({ size: 50 }, { skip: !canUsers });
  const audit = useGetAuditQuery({ size: 50 }, { skip: !canAudit });

  const [createProject, projectState] = useCreateProjectMutation();
  const [createDriver, driverState] = useCreateDriverMutation();
  const [createGroup, groupState] = useCreateGroupMutation();
  const [createUser, userState] = useCreateUserMutation();

  const [projectName, setProjectName] = React.useState('');
  const [driverName, setDriverName] = React.useState('');
  const [groupName, setGroupName] = React.useState('');
  const [newUser, setNewUser] = React.useState<NewUserDraft>({ name: '', username: '', password: '', role: 'ADMIN' });

  const submitProject = async () => {
    try {
      await createProject({ name: projectName.trim(), status: 'ACTIVE' }).unwrap();
      setProjectName('');
    } catch (err) {
      Alert.alert('Project not saved', apiErrorMessage(err));
    }
  };

  const submitDriver = async () => {
    try {
      await createDriver({ name: driverName.trim(), active: true }).unwrap();
      setDriverName('');
    } catch (err) {
      Alert.alert('Driver not saved', apiErrorMessage(err));
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
    try {
      await createUser({
        username: newUser.username.trim(),
        password: newUser.password,
        name: newUser.name.trim(),
        role: newUser.role,
        status: 'ACTIVE',
        permissions: {},
      }).unwrap();
      setNewUser({ name: '', username: '', password: '', role: 'ADMIN' });
    } catch (err) {
      Alert.alert('User not saved', apiErrorMessage(err));
    }
  };

  if (availableTabs.length === 0) {
    return <EmptyLine text="No management modules are available for this account." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.tabRow}>
        {availableTabs.map((value) => (
          <Chip key={value} active={tab === value} label={label(value)} onPress={() => setTab(value)} />
        ))}
      </View>

      {tab === 'devices' && canDevices ? <DeviceCreateForm /> : null}

      {tab === 'users' && canUsers ? (
        <Section
          buttonLabel="Create user"
          loading={userState.isLoading}
          onSubmit={submitUser}
          submitDisabled={!newUser.name.trim() || !newUser.username.trim() || newUser.password.length < 8}
          title="Users">
          <TextField label="Customer name" onChangeText={(name) => setNewUser((v) => ({ ...v, name }))} value={newUser.name} />
          <TextField autoCapitalize="none" label="Username" onChangeText={(username) => setNewUser((v) => ({ ...v, username }))} value={newUser.username} />
          <TextField label="Password" onChangeText={(password) => setNewUser((v) => ({ ...v, password }))} secure value={newUser.password} />
          <View style={styles.categoryRow}>
            {(['ADMIN', 'DRIVER'] as const).map((role) => (
              <Chip key={role} active={newUser.role === role} label={role} onPress={() => setNewUser((v) => ({ ...v, role }))} />
            ))}
          </View>
          {users.data?.content.map((user) => (
            <RowCard key={user.id} icon="account-outline" title={user.name} meta={`${user.username} | ${user.role} | ${user.status}`} />
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
          {projects.data?.map((project) => (
            <RowCard key={project.id} icon="folder-outline" title={project.name} meta={project.status} />
          )) ?? null}
        </Section>
      ) : null}

      {tab === 'drivers' && canDrivers ? (
        <Section
          buttonLabel="Create driver"
          loading={driverState.isLoading}
          onSubmit={submitDriver}
          submitDisabled={!driverName.trim()}
          title="Drivers">
          <TextField label="Driver name" onChangeText={setDriverName} value={driverName} />
          {drivers.data?.map((driver) => (
            <RowCard key={driver.id} icon="card-account-details-outline" title={driver.name} meta={driver.phone ?? 'No phone'} />
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
          {groups.data?.map((group) => (
            <RowCard key={group.id} icon="shape-outline" title={group.name} meta={group.parentId ? `Parent #${group.parentId}` : 'Root group'} />
          )) ?? null}
        </Section>
      ) : null}

      {tab === 'audit' && canAudit ? (
        <Card style={styles.form}>
          <Text style={styles.title}>Audit Logs</Text>
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
    content: { backgroundColor: c.pageBackground, gap: spacing.md, padding: spacing.md },
    tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    form: { gap: spacing.md },
    title: { color: c.textPrimary, fontSize: typography.title, fontWeight: '900' },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  });
