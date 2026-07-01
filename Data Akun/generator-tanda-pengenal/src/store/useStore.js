import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_CARD_SETTINGS } from '../utils/cardTemplates';
import {
  sanitizePersistedGeneratorState,
  sanitizeSelectedUsers,
  sanitizeUser,
  sanitizeUsers,
  validateCardUsers,
} from '../utils/identityCard';

const GENERATOR_STORAGE_VERSION = 1;

// Main application store
export const useStore = create(
  persist(
    (set, get) => ({
      // Users data
      users: [],
      selectedUsers: [],
      
      // Activity log
      activityLog: [],

      // Card generation settings
      cardSettings: DEFAULT_CARD_SETTINGS,
      
      // UI state
      isLoading: false,
      error: null,
      
      // Actions for users
      setUsers: (users) => {
        const safeUsers = sanitizeUsers(users);
        set((state) => ({
          users: safeUsers,
          selectedUsers: sanitizeSelectedUsers(state.selectedUsers, safeUsers),
        }));
        get().addActivityLog(`Imported ${safeUsers.length} users`);
      },
      
      addUser: (user) => {
        set((state) => ({ users: [...state.users, sanitizeUser(user, state.users.length)] }));
      },
      
      updateUser: (id, updates) => {
        set((state) => {
          const users = state.users.map((user, index) =>
            user.id === id ? sanitizeUser({ ...user, ...updates }, index) : user
          );

          return {
            users,
            selectedUsers: sanitizeSelectedUsers(state.selectedUsers, users),
          };
        });
      },
      
      deleteUser: (id) => {
        set((state) => ({
          users: state.users.filter((user) => user.id !== id),
          selectedUsers: state.selectedUsers.filter((userId) => userId !== id),
        }));
        get().addActivityLog('Deleted a user');
      },
      
      clearUsers: () => {
        set({ users: [], selectedUsers: [] });
        get().addActivityLog('Cleared all users');
      },

      clearLocalData: () => {
        set({ users: [], selectedUsers: [], activityLog: [] });
      },
      
      // Selection actions
      selectUser: (id) => {
        set((state) => {
          const selectedId = String(id || '').trim();
          const exists = state.users.some((user) => user.id === selectedId);
          if (!selectedId || !exists || state.selectedUsers.includes(selectedId)) return state;

          return {
            selectedUsers: [...state.selectedUsers, selectedId],
          };
        });
      },
      
      deselectUser: (id) => {
        set((state) => ({
          selectedUsers: state.selectedUsers.filter((userId) => userId !== id),
        }));
      },
      
      selectAllUsers: () => {
        set((state) => ({
          selectedUsers: state.users.map((user) => user.id),
        }));
      },
      
      deselectAllUsers: () => {
        set({ selectedUsers: [] });
      },
      
      toggleUserSelection: (id) => {
        const state = get();
        if (state.selectedUsers.includes(id)) {
          state.deselectUser(id);
        } else {
          state.selectUser(id);
        }
      },
      
      // Activity log
      addActivityLog: (message) => {
        const timestamp = new Date().toISOString();
        set((state) => ({
          activityLog: [
            { id: Date.now(), message, timestamp },
            ...state.activityLog,
          ].slice(0, 50), // Keep only last 50 entries
        }));
      },
      
      clearActivityLog: () => {
        set({ activityLog: [] });
      },

      // Card settings
      updateCardSettings: (updates) => {
        set((state) => ({
          cardSettings: {
            ...DEFAULT_CARD_SETTINGS,
            ...state.cardSettings,
            ...updates,
          },
        }));
      },

      resetCardSettings: () => {
        set({ cardSettings: DEFAULT_CARD_SETTINGS });
      },
      
      // UI state
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
      clearError: () => set({ error: null }),
      
      // Statistics
      getStats: () => {
        const state = get();
        const users = state.users;
        const students = users.filter((u) => u.role === 'student');
        const teachers = users.filter((u) => u.role === 'teacher');
        const classes = [...new Set(users.map((u) => u.kelas).filter(Boolean))];
        
        const readiness = validateCardUsers(users);
        
        return {
          totalUsers: users.length,
          totalStudents: students.length,
          totalTeachers: teachers.length,
          totalClasses: classes.length,
          selectedCount: state.selectedUsers.length,
          readyCards: readiness.validCount,
          invalidCards: readiness.invalidCount,
        };
      },
      
      // Get filtered users
      getFilteredUsers: (filters = {}) => {
        const state = get();
        let filtered = [...state.users];
        
        if (filters.role) {
          filtered = filtered.filter((u) => u.role === filters.role);
        }
        
        if (filters.kelas) {
          filtered = filtered.filter((u) => u.kelas === filters.kelas);
        }
        
        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter(
            (u) =>
              u.nama?.toLowerCase().includes(searchLower) ||
              u.nisn?.toLowerCase().includes(searchLower)
          );
        }
        
        return filtered;
      },
      
      // Get selected user objects
      getSelectedUsers: () => {
        const state = get();
        return state.users.filter((u) => state.selectedUsers.includes(u.id));
      },
    }),
    {
      name: 'id-card-generator-storage',
      version: GENERATOR_STORAGE_VERSION,
      migrate: (persistedState) => sanitizePersistedGeneratorState(persistedState),
      merge: (persistedState, currentState) => {
        const safeState = sanitizePersistedGeneratorState(persistedState);
        return {
          ...currentState,
          ...safeState,
          cardSettings: {
            ...DEFAULT_CARD_SETTINGS,
            ...safeState.cardSettings,
          },
        };
      },
      partialize: (state) => {
        const safeState = sanitizePersistedGeneratorState(state);
        return {
          users: safeState.users,
          activityLog: safeState.activityLog,
          cardSettings: {
            ...DEFAULT_CARD_SETTINGS,
            ...safeState.cardSettings,
          },
        };
      },
    }
  )
);

export default useStore;
