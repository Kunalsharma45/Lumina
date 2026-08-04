const { centroid, haversineDistanceMeters } = require('../utils/geoDistance')

function buildCompleteDistanceMatrix(poles) {
  return poles.map((sourcePole, sourceIndex) => {
    return poles.map((targetPole, targetIndex) => {
      if (sourceIndex === targetIndex) {
        return 0
      }

      return haversineDistanceMeters(sourcePole, targetPole)
    })
  })
}

function buildMinimumSpanningTree(poles) {
  if (poles.length <= 1) {
    return []
  }

  const distances = buildCompleteDistanceMatrix(poles)
  const visited = new Set([0])
  const edges = []

  while (visited.size < poles.length) {
    let bestEdge = null

    for (const visitedIndex of visited) {
      for (let candidateIndex = 0; candidateIndex < poles.length; candidateIndex += 1) {
        if (visited.has(candidateIndex)) {
          continue
        }

        const weight = distances[visitedIndex][candidateIndex]
        if (!bestEdge || weight < bestEdge.weight) {
          bestEdge = {
            fromIndex: visitedIndex,
            toIndex: candidateIndex,
            weight,
          }
        }
      }
    }

    if (!bestEdge) {
      break
    }

    visited.add(bestEdge.toIndex)
    edges.push(bestEdge)
  }

  return edges
}

function chooseRootPole(poles, transformer) {
  if (!poles.length) {
    return null
  }

  if (transformer?.parent_pole_id) {
    const explicitRoot = poles.find((pole) => pole.id === transformer.parent_pole_id)
    if (explicitRoot) {
      return explicitRoot
    }
  }

  const transformerPoint = {
    latitude: transformer?.latitude ?? centroid(poles)?.latitude ?? poles[0].latitude,
    longitude: transformer?.longitude ?? centroid(poles)?.longitude ?? poles[0].longitude,
  }

  return poles.reduce((bestPole, currentPole) => {
    if (!bestPole) {
      return currentPole
    }

    const currentDistance = haversineDistanceMeters(transformerPoint, currentPole)
    const bestDistance = haversineDistanceMeters(transformerPoint, bestPole)
    return currentDistance < bestDistance ? currentPole : bestPole
  }, null)
}

function orientTreeFromRoot(poles, edges, rootPole) {
  const adjacency = new Map()
  for (const pole of poles) {
    adjacency.set(pole.id, [])
  }

  for (const edge of edges) {
    const sourcePole = poles[edge.fromIndex]
    const targetPole = poles[edge.toIndex]
    adjacency.get(sourcePole.id).push(targetPole.id)
    adjacency.get(targetPole.id).push(sourcePole.id)
  }

  const ordered = []
  const visited = new Set()
  const queue = [rootPole.id]
  const parentById = new Map([[rootPole.id, null]])

  while (queue.length) {
    const currentId = queue.shift()
    if (visited.has(currentId)) {
      continue
    }

    visited.add(currentId)
    const currentPole = poles.find((pole) => pole.id === currentId)
    ordered.push({
      ...currentPole,
      parent_pole_id: parentById.get(currentId),
      seq_on_line: ordered.length + 1,
      topology_inferred: true,
    })

    for (const neighborId of adjacency.get(currentId) || []) {
      if (!visited.has(neighborId)) {
        parentById.set(neighborId, currentId)
        queue.push(neighborId)
      }
    }
  }

  return ordered
}

const topologyCache = new Map()

function clearTopologyCache() {
  topologyCache.clear()
}

function inferPoleTopology(poles, transformer = null) {
  if (!Array.isArray(poles) || poles.length === 0) {
    return []
  }

  const cacheKey = transformer?.id
    ? `dt-${transformer.id}-${poles.length}`
    : `poles-${poles.map((p) => p.id).join(',')}`

  if (topologyCache.has(cacheKey)) {
    return topologyCache.get(cacheKey)
  }

  const rootPole = chooseRootPole(poles, transformer) || poles[0]
  const edges = buildMinimumSpanningTree(poles)
  const orderedPoles = orientTreeFromRoot(poles, edges, rootPole)

  const result = orderedPoles.map((pole) => ({
    ...pole,
    topology_inferred: true,
    transformer_id: transformer?.id ?? pole.transformer_id,
  }))

  topologyCache.set(cacheKey, result)
  return result
}

module.exports = {
  buildMinimumSpanningTree,
  clearTopologyCache,
  inferPoleTopology,
}