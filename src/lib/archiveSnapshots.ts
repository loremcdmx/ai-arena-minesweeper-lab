export interface ArchivedSnapshot {
  profileId: string
  snapshotType: 'milestone' | 'peak'
  milestone: number
  elo: number
  generation: number
  createdAt: number
}

export function archiveSnapshotKey(snapshot: ArchivedSnapshot) {
  return snapshot.snapshotType === 'peak'
    ? `${snapshot.profileId}-peak`
    : `${snapshot.profileId}-milestone-${snapshot.milestone}`
}

function prefersCandidate<T extends ArchivedSnapshot>(current: T, candidate: T) {
  if (candidate.snapshotType === 'peak' && current.snapshotType === 'peak') {
    if (candidate.elo !== current.elo) {
      return candidate.elo > current.elo
    }

    if (candidate.generation !== current.generation) {
      return candidate.generation > current.generation
    }
  }

  if (candidate.createdAt !== current.createdAt) {
    return candidate.createdAt > current.createdAt
  }

  if (candidate.generation !== current.generation) {
    return candidate.generation > current.generation
  }

  if (candidate.elo !== current.elo) {
    return candidate.elo > current.elo
  }

  return candidate.milestone >= current.milestone
}

export function mergeSnapshotArchive<T extends ArchivedSnapshot>(
  snapshots: Array<T | null | undefined>,
) {
  const merged = new Map<string, T>()

  for (const snapshot of snapshots) {
    if (!snapshot) {
      continue
    }

    const key = archiveSnapshotKey(snapshot)
    const existing = merged.get(key)

    if (!existing || prefersCandidate(existing, snapshot)) {
      merged.set(key, snapshot)
    }
  }

  return [...merged.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    if (left.generation !== right.generation) {
      return left.generation - right.generation
    }

    return left.elo - right.elo
  })
}
