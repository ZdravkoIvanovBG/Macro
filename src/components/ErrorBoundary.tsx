import { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Button from './Button';
import { theme } from '../lib/theme';
import i18n from '../i18n/index';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time faults so a bug in one screen shows a readable message
 * and a way back, instead of a blank white screen with no recourse. Logged
 * data is untouched — retrying re-mounts the tree against the same database.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in Micro:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View className="flex-1 bg-ink px-6 pt-24">
        <Ionicons name="bug-outline" size={28} color={theme.danger} />
        <Text className="mt-4 text-xl font-bold text-white">{i18n.t('errorBoundary.title')}</Text>
        <Text className="mt-2 text-sm leading-5 text-neutral-400">
          {i18n.t('errorBoundary.message')}
        </Text>

        <ScrollView className="mt-4 max-h-48 rounded-xl border border-ink-line bg-ink-soft p-3">
          <Text className="text-xs leading-5 text-neutral-400">
            {error.message || String(error)}
          </Text>
        </ScrollView>

        <Button label={i18n.t('common.tryAgain')} onPress={this.reset} className="mt-6" />
      </View>
    );
  }
}
