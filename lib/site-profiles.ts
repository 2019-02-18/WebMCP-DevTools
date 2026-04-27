import type { SiteProfile, GeneratedToolDef } from './types';

const STORAGE_KEY = 'site_profiles';

export async function getProfiles(): Promise<SiteProfile[]> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || [];
  } catch {
    return [];
  }
}

export async function saveProfile(profile: SiteProfile): Promise<void> {
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === profile.id);
  if (idx >= 0) {
    profiles[idx] = { ...profile, updatedAt: Date.now() };
  } else {
    profiles.push(profile);
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
}

export async function deleteProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  await chrome.storage.local.set({
    [STORAGE_KEY]: profiles.filter((p) => p.id !== id),
  });
}

export async function toggleAutoInject(id: string, enabled: boolean): Promise<void> {
  const profiles = await getProfiles();
  const profile = profiles.find((p) => p.id === id);
  if (profile) {
    profile.autoInject = enabled;
    profile.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
  }
}

export function findMatchingProfiles(url: string): SiteProfile[] {
  // This is used synchronously after loading profiles via getProfiles()
  return []; // placeholder — use matchProfilesForUrl instead
}

export function matchProfilesForUrl(profiles: SiteProfile[], url: string): SiteProfile[] {
  try {
    const parsed = new URL(url);
    return profiles.filter((p) => {
      if (p.urlPattern) {
        try {
          return new RegExp(p.urlPattern).test(url);
        } catch {
          return false;
        }
      }
      return parsed.hostname === p.domain || parsed.hostname.endsWith(`.${p.domain}`);
    });
  } catch {
    return [];
  }
}

export function createProfile(
  domain: string,
  name: string,
  tools: GeneratedToolDef[],
  urlPattern?: string,
): SiteProfile {
  return {
    id: crypto.randomUUID(),
    domain,
    urlPattern,
    name,
    tools,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    autoInject: true,
  };
}

export function exportProfile(profile: SiteProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function importProfile(json: string): SiteProfile {
  const data = JSON.parse(json);
  if (!data.domain || !data.name || !Array.isArray(data.tools)) {
    throw new Error('Invalid profile format: missing domain, name, or tools');
  }
  return {
    id: crypto.randomUUID(),
    domain: data.domain,
    urlPattern: data.urlPattern,
    name: data.name,
    tools: data.tools,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    autoInject: data.autoInject ?? true,
  };
}
