import React, { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './Attendance.css';

// Fix Leaflet marker icon issue in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Auto bounds controller to show both user and office if too far
function MapBoundsController({ location, officeLocation, isOutside }) {
  const map = useMap();
  useEffect(() => {
    if (location && officeLocation && isOutside) {
      const bounds = L.latLngBounds(
        [location.lat, location.lng],
        [officeLocation.lat, officeLocation.lng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (location) {
      map.setView([location.lat, location.lng], 16);
    }
  }, [location, officeLocation, isOutside, map]);
  return null;
}

const formatAccuracy = (acc) => {
  if (acc === null || acc === undefined) return '';
  if (acc >= 1000) {
    return `~${Math.round(acc / 1000)}km`;
  }
  return `~${Math.round(acc)}m`;
};

export default function Attendance({ token, decoded }) {
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [officeLocation, setOfficeLocation] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState(null); // 'success' or 'error'

  const [attendanceData, setAttendanceData] = useState([]);
  const [adminData, setAdminData] = useState([]);
  const [viewAdmin, setViewAdmin] = useState(false);

  // Initial load
  useEffect(() => {
    fetchOfficeLocation();
    fetchMyAttendance();
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

    // Use watchPosition for live location tracking
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setAccuracy(position.coords.accuracy);
        setLocationError(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocation(null);
          setAccuracy(null);
          setLocationError(
            "We couldn't access your location. Please check your browser settings and enable location permissions for this site to check in."
          );
        } else {
          // Only show error if we don't already have a location
          setLocation((currentLocation) => {
            if (!currentLocation) {
              setLocationError(
                "We couldn't access your location. Geolocation request timed out or failed."
              );
            }
            return currentLocation;
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }
    setLocationError("Attempting to find your live location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setAccuracy(position.coords.accuracy);
        setLocationError(null);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocation(null);
          setAccuracy(null);
          setLocationError("We couldn't access your location. Please check your browser settings and enable location permissions.");
        } else {
          setLocation((currentLocation) => {
            if (!currentLocation) {
              setLocationError("We couldn't access your location. Geolocation request timed out or failed.");
            } else {
              setLocationError(null); // Clear attempting message
            }
            return currentLocation;
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const fetchOfficeLocation = async () => {
    try {
      const res = await fetch(`${API_URL}/attendance/office`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.location_lat !== null && data.location_lng !== null) {
          setOfficeLocation({
            lat: data.location_lat,
            lng: data.location_lng,
            radius: data.location_radius_m || 200
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMyAttendance = async () => {
    try {
      const res = await fetch(`${API_URL}/attendance/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAttendanceData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminAttendance = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/attendance`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminData(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (viewAdmin) {
      fetchAdminAttendance();
    }
  }, [viewAdmin]);

  const handleAction = async (isCheckIn) => {
    if (!location) {
      setStatusMessage("Location not available. Please allow location access.");
      setStatusType('error');
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);

    const url = isCheckIn ? `${API_URL}/attendance/check-in` : `${API_URL}/attendance/check-out`;
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          accuracy: accuracy
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setStatusMessage(data.error || "Action failed");
        setStatusType('error');
      } else {
        setStatusMessage(isCheckIn ? "Within range of office" : "Checked out successfully");
        setStatusType('success');
        // Refresh data
        await fetchMyAttendance();
      }
    } catch (e) {
      setStatusMessage("Network error. Please try again.");
      setStatusType('error');
    } finally {
      setActionLoading(false);
    }
  };

  const activeCheckIn = attendanceData.find(log => log.check_out_at === null);
  const isCheckedIn = !!activeCheckIn;

  // Calculate stats
  let hoursToday = 0;
  let hoursWeek = 0;
  const now = new Date();
  
  attendanceData.forEach(log => {
    const checkIn = new Date(log.check_in_at);
    const checkOut = log.check_out_at ? new Date(log.check_out_at) : now;
    const diffHours = (checkOut - checkIn) / (1000 * 60 * 60);
    
    if (checkIn.toDateString() === now.toDateString()) {
      hoursToday += diffHours;
    }
    
    // Check if within last 7 days roughly
    const diffDays = (now - checkIn) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      hoursWeek += diffHours;
    }
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const renderLocationLink = (lat, lng) => {
    if (lat == null || lng == null) return '-';
    return (
      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" style={{color: 'var(--primary)', textDecoration: 'none'}}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{width: 16, height: 16, verticalAlign: 'middle', marginRight: 4}}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
        Map
      </a>
    );
  };

  const isAdminOrSupervisor = decoded?.role === 'admin' || decoded?.role === 'supervisor';

  // Distance calculation for visual aid
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };
  
  const currentDistance = location && officeLocation 
    ? getDistance(location.lat, location.lng, officeLocation.lat, officeLocation.lng) 
    : 0;
  const isOutside = officeLocation ? currentDistance > officeLocation.radius : false;

  return (
    <div className="attendance-container">
      <div className="page-header-container" style={{ marginBottom: 0 }}>
        <div className="page-header">
          <h1>Attendance Tracker</h1>
          <p>Record your check-in and check-out times with location verification.</p>

        </div>
        {isAdminOrSupervisor && (
          <div className="quick-actions">
            <button 
              className="btn-secondary toggle-admin-btn" 
              onClick={() => setViewAdmin(!viewAdmin)}
            >
              {viewAdmin ? "View My Attendance" : "View Team Attendance"}
            </button>
          </div>
        )}
      </div>

      {viewAdmin ? (
        <div className="table-wrapper">
          <h3>Team Attendance (Last 7 Days)</h3>
          <table className="attendance-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {adminData.map(log => (
                <tr key={log.id}>
                  <td>{log.users?.username || 'Unknown'}</td>
                  <td>{log.users?.role || '-'}</td>
                  <td>{formatDate(log.check_in_at)}</td>
                  <td>{formatDate(log.check_out_at)}</td>
                  <td>{renderLocationLink(log.check_in_lat, log.check_in_lng)}</td>
                </tr>
              ))}
              {adminData.length === 0 && (
                <tr>
                  <td colSpan="5" style={{textAlign: 'center'}}>No recent team attendance found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="attendance-grid">
          <div className="map-panel">
            {statusMessage && (
              <div className={`status-badge status-${statusType}`}>
                {statusType === 'error' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 18, height: 18}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 18, height: 18}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{statusMessage}</span>
              </div>
            )}

            {locationError && (
              <div className="location-error" style={{
                background: locationError.includes("Attempting") ? 'var(--surface)' : 'var(--warning-bg)',
                borderColor: locationError.includes("Attempting") ? 'var(--border)' : 'rgba(245, 158, 11, 0.3)',
                color: locationError.includes("Attempting") ? 'var(--text)' : 'var(--warning)',
                marginBottom: '16px'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 24, height: 24, flexShrink: 0}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
                <div>
                  <strong>{locationError.includes("Attempting") ? "Finding Location..." : "Location Access Denied"}</strong>
                  <p style={{margin: '4px 0 0 0'}}>{locationError}</p>
                  {!locationError.includes("Attempting") && (
                    <button className="btn-secondary" style={{marginTop: 8, padding: '6px 12px', fontSize: 12}} onClick={requestLocation}>
                      Try Again
                    </button>
                  )}
                </div>
              </div>
            )}

            {location && accuracy > 500 && (
              <div className="location-warning" style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                color: 'var(--warning)',
                padding: '12px 16px',
                borderRadius: 'var(--radius)',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                lineHeight: '1.5',
                marginBottom: '16px'
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 24, height: 24, flexShrink: 0}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <strong>Low Location Accuracy</strong>
                  <p style={{margin: '4px 0 0 0'}}>
                    Location accuracy is low ({formatAccuracy(accuracy)}) — this is common on laptops without GPS hardware. 
                    For accurate results, test from a mobile device.
                  </p>
                </div>
              </div>
            )}

            <div className="map-wrapper" style={{ position: 'relative' }}>
              <button 
                className="refresh-location-btn"
                onClick={requestLocation}
                title="Refresh Location"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 1000,
                  background: 'var(--card-bg)',
                  border: '2px solid rgba(0,0,0,0.2)',
                  borderRadius: '4px',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 20, height: 20, color: '#333'}}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25v2.25m0 15v2.25m9.75-9.75h-2.25m-15 0h-2.25m11.25 0a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0z" />
                </svg>
              </button>
              <MapContainer 
                center={location ? [location.lat, location.lng] : (officeLocation ? [officeLocation.lat, officeLocation.lng] : [0, 0])} 
                zoom={location || officeLocation ? 15 : 2} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {officeLocation && (
                  <Circle 
                    center={[officeLocation.lat, officeLocation.lng]} 
                    radius={officeLocation.radius} 
                    pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
                  />
                )}
                {location && officeLocation && isOutside && (
                  <Polyline 
                    positions={[
                      [location.lat, location.lng],
                      [officeLocation.lat, officeLocation.lng]
                    ]}
                    color="#ef4444"
                    dashArray="5, 10"
                    weight={3}
                  />
                )}
                {location && (
                  <>
                    <MapBoundsController location={location} officeLocation={officeLocation} isOutside={isOutside} />
                    <Marker position={[location.lat, location.lng]} />
                  </>
                )}
              </MapContainer>
            </div>
            
            {accuracy !== null && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right', marginBottom: '8px' }}>
                Accuracy: {formatAccuracy(accuracy)}
              </div>
            )}

            <button 
              className={`btn-primary ${isCheckedIn ? 'btn-secondary' : ''}`}
              style={isCheckedIn ? { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-h)' } : {}}
              onClick={() => handleAction(!isCheckedIn)}
              disabled={actionLoading || loading || !location}
            >
              {actionLoading ? (
                <div className="spinner" style={isCheckedIn ? {borderColor: 'rgba(0,0,0,0.1)', borderTopColor: 'var(--text-h)'} : {}} />
              ) : (
                isCheckedIn ? "Check Out" : "Check In"
              )}
            </button>
          </div>

          <div className="stats-panel">
            <div className="summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              <div className="summary-card" style={{ padding: 16 }}>
                <div className="summary-details">
                  <h3 style={{ fontSize: 20 }}>{isCheckedIn ? new Date(activeCheckIn.check_in_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}</h3>
                  <p>Checked In</p>
                </div>
              </div>
              <div className="summary-card" style={{ padding: 16 }}>
                <div className="summary-details">
                  <h3 style={{ fontSize: 20 }}>{hoursToday.toFixed(1)}h</h3>
                  <p>Today</p>
                </div>
              </div>
              <div className="summary-card" style={{ padding: 16 }}>
                <div className="summary-details">
                  <h3 style={{ fontSize: 20 }}>{hoursWeek.toFixed(1)}h</h3>
                  <p>This Week</p>
                </div>
              </div>
            </div>

            <div className="table-wrapper">
              <h3>This Week</h3>
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceData.slice(0, 7).map(log => (
                    <tr key={log.id}>
                      <td>{new Date(log.check_in_at).toLocaleDateString()}</td>
                      <td>{new Date(log.check_in_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                      <td>{log.check_out_at ? new Date(log.check_out_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-'}</td>
                      <td>{renderLocationLink(log.check_in_lat, log.check_in_lng)}</td>
                    </tr>
                  ))}
                  {attendanceData.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{textAlign: 'center'}}>No attendance records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
