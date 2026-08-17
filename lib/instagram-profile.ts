interface InstagramProfileLike {
  isFollower?: boolean | null;
  isFollowing?: boolean | null;
  [key: string]: unknown;
}

interface InstagramSenderLike {
  instagramProfile?: InstagramProfileLike | null;
  [key: string]: unknown;
}

export interface FollowerDiagnostic {
  profilePresent: boolean;
  isFollower: boolean | null;
  isFollowing: boolean | null;
}

export function followerDiagnostic(sender: InstagramSenderLike): FollowerDiagnostic {
  const profile = sender.instagramProfile;
  return {
    profilePresent: profile != null,
    isFollower: typeof profile?.isFollower === "boolean" ? profile.isFollower : null,
    isFollowing: typeof profile?.isFollowing === "boolean" ? profile.isFollowing : null,
  };
}
