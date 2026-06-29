import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0500124353",
  appId: "1:808666249565:web:83f88e8f3f869b6d1f90b4",
  apiKey: "AIzaSyBS6p24SyeVhjnP7aZBT23Yd6uTrgKwwH4",
  authDomain: "gen-lang-client-0500124353.firebaseapp.com",
  storageBucket: "gen-lang-client-0500124353.firebasestorage.app",
  messagingSenderId: "808666249565",
  measurementId: ""
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-dailyalcoholtest-580a2749-d0ed-4423-aa90-10ee0a7565fb");

const provider = new GoogleAuthProvider();
// Google Drive scopes as requested and approved
provider.addScope("https://www.googleapis.com/auth/drive");
provider.addScope("https://www.googleapis.com/auth/drive.file");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Firebase Auth");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Google Drive helpers
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export const uploadBackupToDrive = async (
  accessToken: string,
  logs: any[],
  employees: any[],
  supervisors: any[],
  departments: any[]
): Promise<GoogleDriveFile> => {
  const metadata = {
    name: `alcohol_screening_backup_${new Date().toISOString().slice(0, 10)}.json`,
    mimeType: "application/json",
    description: "Alcohol screening app backup file"
  };
  
  const content = {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    logs,
    employees,
    supervisors,
    departments
  };

  const fileContent = JSON.stringify(content, null, 2);

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", new Blob([fileContent], { type: "application/json" }));

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to upload to Google Drive: ${errText || response.statusText}`);
  }

  return response.json();
};

export const listBackupsInDrive = async (accessToken: string): Promise<GoogleDriveFile[]> => {
  const query = "name contains 'alcohol_screening_backup_' and mimeType = 'application/json' and trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime,modifiedTime,size)&orderBy=createdTime%2520desc`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to list backups: ${errText || response.statusText}`);
  }

  const data = await response.json();
  return data.files || [];
};

export const downloadBackupFromDrive = async (accessToken: string, fileId: string): Promise<any> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to download backup: ${errText || response.statusText}`);
  }

  return response.json();
};

export const deleteBackupFromDrive = async (accessToken: string, fileId: string): Promise<void> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to delete backup file: ${errText || response.statusText}`);
  }
};
