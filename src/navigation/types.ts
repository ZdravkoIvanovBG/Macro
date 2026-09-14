import type { NavigatorScreenParams } from '@react-navigation/native';

import type { EntryPrefill } from '../lib/types';

export type RootTabParamList = {
  Log: undefined;
  Search: undefined;
  Ingredients: undefined;
  History: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<RootTabParamList>;
  /**
   * Add or edit a single food entry. `entryId` switches the form to edit mode;
   * `prefill` seeds a new entry from search, a barcode, or a recent food.
   */
  EntryForm: {
    date: string;
    entryId?: number;
    prefill?: EntryPrefill;
  };
  /** Calorie/macro barcode scanner, pushed from the Today screen's Scan tile. */
  Scan: undefined;
  /** Read-only ingredient breakdown for a scanned barcode — never logs anything. */
  IngredientsReport: { barcode: string };
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
