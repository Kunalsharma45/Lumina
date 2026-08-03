const EARTH_RADIUS_METERS = 6371000

function toRadians(value) {
  return (value * Math.PI) / 180
}

function haversineDistanceMeters(pointA, pointB) {
  const lat1 = toRadians(pointA.latitude)
  const lat2 = toRadians(pointB.latitude)
  const deltaLat = toRadians(pointB.latitude - pointA.latitude)
  const deltaLng = toRadians(pointB.longitude - pointA.longitude)

  const sinLat = Math.sin(deltaLat / 2)
  const sinLng = Math.sin(deltaLng / 2)
  const a = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_METERS * c
}

function centroid(points) {
  if (!points.length) {
    return null
  }

  const totals = points.reduce(
    (accumulator, point) => {
      accumulator.latitude += point.latitude
      accumulator.longitude += point.longitude
      return accumulator
    },
    { latitude: 0, longitude: 0 },
  )

  return {
    latitude: totals.latitude / points.length,
    longitude: totals.longitude / points.length,
  }
}

module.exports = {
  centroid,
  haversineDistanceMeters,
}