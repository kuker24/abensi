import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getQrPayload } from '../components/cards/cardConfig';

// Main application store
export const useStore = create(
  persist(
    (set, get) => ({
      // Users data
      users: [],
      selectedUsers: [],
      
      // Activity log
      activityLog: [],
      
      // UI state
      isLoading: false,
      error: null,
      
      // Actions for users
      setUsers: (users) => {
        set({ users });
        get().addActivityLog(`Imported ${users.length} users`);
      },

      mergeUsersByUsername: (incomingUsers) => {
        const state = get();
        const existingByUsername = new Map(state.users.map((user) => [String(user.username || '').toLowerCase(), user]));
        const incomingUsernames = new Set();
        const mergedExisting = state.users.map((user) => {
          const key = String(user.username || '').toLowerCase();
          const incoming = incomingUsers.find((item) => String(item.username || '').toLowerCase() === key);
          if (!incoming) return user;
          incomingUsernames.add(key);
          return {
            ...incoming,
            ...user,
            qrCode: incoming.qrCode || user.qrCode,
            qrMasked: incoming.qrMasked || user.qrMasked,
            shortCode: incoming.shortCode || user.shortCode,
            label: incoming.label || user.label,
            source: incoming.source || user.source,
            program: user.program || incoming.program,
            status: user.status || incoming.status,
            kelas: user.kelas || incoming.kelas,
            level: user.level || incoming.level,
          };
        });
        const newUsers = incomingUsers.filter((user) => {
          const key = String(user.username || '').toLowerCase();
          return !existingByUsername.has(key) && !incomingUsernames.has(key);
        });
        const merged = [...mergedExisting, ...newUsers];
        set({ users: merged });
        get().addActivityLog(`Merged ${incomingUsers.length} QR/backend records`);
        return merged;
      },
      
      addUser: (user) => {
        set((state) => ({ users: [...state.users, user] }));
      },
      
      updateUser: (id, updates) => {
        set((state) => ({
          users: state.users.map((user) =>
            user.id === id ? { ...user, ...updates } : user
          ),
        }));
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
      
      // Selection actions
      selectUser: (id) => {
        set((state) => ({
          selectedUsers: [...state.selectedUsers, id],
        }));
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
        const staff = users.filter((u) => u.role === 'staff');
        const classes = [...new Set(users.map((u) => u.kelas).filter(Boolean))];
        const officialQrCount = users.filter((u) => getQrPayload(u).startsWith('schoolhub:qr:v1:')).length;

        return {
          totalUsers: users.length,
          totalStudents: students.length,
          totalTeachers: teachers.length,
          totalStaff: staff.length,
          totalClasses: classes.length,
          selectedCount: state.selectedUsers.length,
          officialQrCount,
          fallbackQrCount: users.length - officialQrCount,
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
              u.username?.toLowerCase().includes(searchLower)
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
      partialize: (state) => ({
        users: state.users,
        activityLog: state.activityLog,
      }),
    }
  )
);

export default useStore;
