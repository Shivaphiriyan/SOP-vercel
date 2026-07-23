import { useState, useEffect, useRef } from 'react';
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

import { formatDuration, getWorkweekBounds, calculateAttendanceDurationSec, getTodayBounds } from './utils/attendance';

// Auto bounds controller for Leaflet map
function MapBoundsController({ location, officeLocation, isOutside }) {
  const map = useMap();
  useEffect(() => {
    if (location && officeLocation && isOutside) {
      const bounds = L.latLngBounds(
        [location.lat, location.lng],
        [officeLocation.lat, officeLocation.lng]
      );
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else if (location) {
      map.setView([location.lat, location.lng], 15);
    } else if (officeLocation) {
      map.setView([officeLocation.lat, officeLocation.lng], 15);
    }
  }, [location, officeLocation, isOutside, map]);
  return null;
}

export default function Attendance({ token, decoded }) {
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [officeLocation, setOfficeLocation] = useState(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState(null);

  const [attendanceData, setAttendanceData] = useState([]);
  const [adminData, setAdminData] = useState([]);
  const [viewAdmin, setViewAdmin] = useState(false);

  // Filters & Pagination State
  const [monthFilter, setMonthFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Map Ref for scrolling into view
  const mapCardRef = useRef(null);

  // Live timer updating every 10s
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchOfficeLocation();
    fetchMyAttendance();

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      return;
    }

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
          setLocationError("Location access denied. Please enable location permissions.");
        } else {
          setLocation((cur) => cur);
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
    setLocationError("Locating...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setAccuracy(position.coords.accuracy);
        setLocationError(null);
      },
      () => {
        setLocationError("Location access denied. Enable permissions to check in.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const fetchOfficeLocation = async () => {
    try {
      const res = await fetch(`${API_URL}/attendance/office`, {
        headers: { Authorization: `Bearer ${token}` }
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
        headers: { Authorization: `Bearer ${token}` }
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
        headers: { Authorization: `Bearer ${token}` }
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
    if (actionLoading) return;
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
          Authorization: `Bearer ${token}`
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
        setStatusMessage(isCheckIn ? "Checked in successfully" : "Checked out successfully");
        setStatusType('success');
        await fetchMyAttendance();
      }
    } catch (e) {
      setStatusMessage("Network error. Please try again.");
      setStatusType('error');
    } finally {
      setActionLoading(false);
    }
  };

  const scrollToMap = () => {
    if (mapCardRef.current) {
      mapCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Session state checks
  const activeCheckIn = attendanceData.find((log) => log.check_out_at === null);
  const isCheckedIn = !!activeCheckIn;

  const { start: todayStart, end: todayEnd } = getTodayBounds(currentTime);
  const todayCompletedLog = attendanceData.find((log) => {
    const checkIn = new Date(log.check_in_at);
    return checkIn >= todayStart && checkIn <= todayEnd && log.check_out_at !== null;
  });

  const isCompletedToday = !isCheckedIn && !!todayCompletedLog;

  // Duration calculations
  const todayDurationSec = isCheckedIn
    ? calculateAttendanceDurationSec(activeCheckIn.check_in_at, null, { allowLive: true, currentTime })
    : todayCompletedLog
    ? calculateAttendanceDurationSec(todayCompletedLog.check_in_at, todayCompletedLog.check_out_at)
    : 0;

  const { start: weekStart, end: weekEnd } = getWorkweekBounds(currentTime);
  let weeklyDurationSec = 0;
  attendanceData.forEach((log) => {
    const checkIn = new Date(log.check_in_at);
    if (checkIn >= weekStart && checkIn <= weekEnd) {
      const isLive = !log.check_out_at && log.id === activeCheckIn?.id;
      weeklyDurationSec += calculateAttendanceDurationSec(log.check_in_at, log.check_out_at, { allowLive: isLive, currentTime });
    }
  });

  // Calculate monthly stats
  const nowMonth = currentTime.getMonth();
  const nowYear = currentTime.getFullYear();
  let monthlyDurationSec = 0;
  let presentDaysCount = 0;

  attendanceData.forEach((log) => {
    const d = new Date(log.check_in_at);
    if (d.getMonth() === nowMonth && d.getFullYear() === nowYear) {
      const isLive = !log.check_out_at && log.id === activeCheckIn?.id;
      monthlyDurationSec += calculateAttendanceDurationSec(log.check_in_at, log.check_out_at, { allowLive: isLive, currentTime });
      presentDaysCount += 1;
    }
  });

  const avgDailySec = presentDaysCount > 0 ? Math.round(monthlyDurationSec / presentDaysCount) : 0;

  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '--:-- --';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateReadable = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const isAdminOrSupervisor = decoded?.role === 'admin' || decoded?.role === 'supervisor';

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = ((lat2 - lat1) * Math.PI) / 180;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dp / 2) * Math.sin(dp / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const currentDistance =
    location && officeLocation
      ? getDistance(location.lat, location.lng, officeLocation.lat, officeLocation.lng)
      : 0;
  const isOutside = officeLocation ? currentDistance > officeLocation.radius : false;

  // Filter History Records
  const sourceTableData = viewAdmin ? adminData : attendanceData;
  const filteredHistory = sourceTableData.filter((item) => {
    // Status Filter
    if (statusFilter !== 'All') {
      const isWorking = !item.check_out_at;
      if (statusFilter === 'Working' && !isWorking) return false;
      if (statusFilter === 'Completed' && isWorking) return false;
    }
    // Search Query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const userMatch = item.users?.username?.toLowerCase().includes(q);
      const dateMatch = new Date(item.check_in_at).toLocaleDateString().toLowerCase().includes(q);
      if (!userMatch && !dateMatch) return false;
    }
    return true;
  });

  // Pagination logic
  const totalEntries = filteredHistory.length;
  const totalPages = Math.ceil(totalEntries / itemsPerPage) || 1;
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="attendance-page-container">
      {/* 1. Page Header */}
      <div className="attendance-page-header">
        <div className="header-left">
          <h1 className="header-title">Attendance</h1>
          <p className="header-subtitle">Track your daily working hours and attendance.</p>
        </div>
        {isAdminOrSupervisor && (
          <div className="header-right">
            <button
              className="btn-secondary compact-btn"
              onClick={() => setViewAdmin(!viewAdmin)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.109A11.386 11.386 0 0110.089 21c-2.907 0-5.542-1.09-7.533-2.893m0 0A4.125 4.125 0 0110 16.03c1.973 0 3.738.694 5 1.838m-9.75-2.78c.002.083.002.167.002.252H2.25m3.75-2.25a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5zm9.75-3a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
              </svg>
              {viewAdmin ? "View My Attendance" : "View Team Attendance"}
            </button>
          </div>
        )}
      </div>

      {statusMessage && (
        <div className={`status-toast toast-${statusType}`}>
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 2. Top Attendance Two-Column Section (40% Left / 60% Right) */}
      <div className="attendance-top-grid">
        {/* Left Column: Today's Attendance Card */}
        <div className="att-card todays-att-card">
          <div className="card-header-row">
            <h2 className="card-title">Today’s Attendance</h2>
            <span className={`status-pill ${isCheckedIn ? 'pill-working' : isCompletedToday ? 'pill-completed' : 'pill-not-started'}`}>
              <span className="status-dot" />
              {isCheckedIn ? 'Working' : isCompletedToday ? 'Completed' : 'Not Started'}
            </span>
          </div>

          <div className="att-metrics-grid">
            <div className="metric-col">
              <span className="metric-label">Check In</span>
              <span className="metric-value">
                {isCheckedIn
                  ? formatTimeOnly(activeCheckIn.check_in_at)
                  : todayCompletedLog
                  ? formatTimeOnly(todayCompletedLog.check_in_at)
                  : '09:00 AM'}
              </span>
              <span className="metric-sub">Today</span>
            </div>

            <div className="metric-col divider-left">
              <span className="metric-label">Check Out</span>
              <span className="metric-value">
                {todayCompletedLog ? formatTimeOnly(todayCompletedLog.check_out_at) : '--:-- --'}
              </span>
              <span className="metric-sub">{todayCompletedLog ? 'Checked out' : 'Not checked out'}</span>
            </div>

            <div className="metric-col divider-left">
              <span className="metric-label">Worked</span>
              <span className="metric-value">{formatDuration(todayDurationSec)}</span>
              <span className="metric-sub text-purple">{isCheckedIn ? 'Live' : 'Final'}</span>
            </div>

            <div className="metric-col divider-left">
              <span className="metric-label">Location</span>
              <span className="metric-value text-green">Verified</span>
              <span className="metric-sub">Main Office</span>
            </div>
          </div>

          <div className="att-action-buttons">
            <button
              className={`btn-primary check-action-btn ${isCompletedToday ? 'btn-disabled' : ''}`}
              disabled={actionLoading || loading || !location || isCompletedToday}
              onClick={() => handleAction(!isCheckedIn)}
            >
              {actionLoading ? (
                <span>Loading...</span>
              ) : isCompletedToday ? (
                'Attendance Completed'
              ) : isCheckedIn ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                  </svg>
                  Check Out
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  Check In
                </>
              )}
            </button>

            <button className="btn-secondary view-loc-btn" onClick={scrollToMap}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              View Location
            </button>
          </div>

          <div className="card-footer-status">
            <span className="live-dot" />
            <span>Last updated: now</span>
          </div>
        </div>

        {/* Right Column: Check-in Location Map Card */}
        <div className="att-card location-map-card" ref={mapCardRef}>
          <div className="card-header-row">
            <h2 className="card-title">Check-in Location</h2>
            <button className="refresh-loc-icon-btn" onClick={requestLocation} title="Refresh Live Location">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>

          <div className="map-container-wrapper">
            <MapContainer
              center={location ? [location.lat, location.lng] : officeLocation ? [officeLocation.lat, officeLocation.lng] : [9.6615, 80.0255]}
              zoom={15}
              style={{ height: '100%', width: '100%', borderRadius: '10px' }}
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {officeLocation && (
                <Circle
                  center={[officeLocation.lat, officeLocation.lng]}
                  radius={officeLocation.radius}
                  pathOptions={{ color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.15 }}
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
              {(location || officeLocation) && (
                <>
                  <MapBoundsController location={location} officeLocation={officeLocation} isOutside={isOutside} />
                  <Marker position={location ? [location.lat, location.lng] : [officeLocation.lat, officeLocation.lng]} />
                </>
              )}
            </MapContainer>

            {/* Floating Location Overlay Box matching mock */}
            <div className="map-floating-overlay">
              <h4 className="overlay-title">Main Office</h4>
              <p className="overlay-address">No. 123, Business Park, Jaffna, Sri Lanka</p>
              <p className="overlay-coords">
                {location ? `${location.lat.toFixed(4)}° N, ${location.lng.toFixed(4)}° E` : '9.6615° N, 80.0255° E'}
              </p>
              <p className="overlay-time">Today, {formatTimeOnly(activeCheckIn?.check_in_at || todayCompletedLog?.check_in_at || new Date())}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Four Attendance Summary Cards Grid */}
      <div className="attendance-summary-grid">
        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-purple">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <span className="summary-title">This Week</span>
          </div>
          <span className="summary-value">{formatDuration(weeklyDurationSec)}</span>
          <span className="summary-sub">Total Working Hours</span>
          {/* Mini Sparkline SVG */}
          <div className="sparkline-container">
            <svg viewBox="0 0 100 20" className="sparkline-svg">
              <path d="M0 15 Q25 5 50 12 T100 3" fill="none" stroke="#8b5cf6" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-green">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <span className="summary-title">This Month</span>
          </div>
          <span className="summary-value">{formatDuration(monthlyDurationSec)}</span>
          <span className="summary-sub">Total Working Hours</span>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 20" className="sparkline-svg">
              <path d="M0 18 Q25 10 50 8 T100 2" fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-orange">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <span className="summary-title">Present Days</span>
          </div>
          <span className="summary-value">{presentDaysCount} days</span>
          <span className="summary-sub">This Month</span>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 20" className="sparkline-svg">
              <path d="M0 14 Q25 18 50 10 T100 4" fill="none" stroke="#f59e0b" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-top-row">
            <div className="summary-icon-box icon-blue">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="summary-title">Average Daily Hours</span>
          </div>
          <span className="summary-value">{formatDuration(avgDailySec)}</span>
          <span className="summary-sub">This Month</span>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 20" className="sparkline-svg">
              <path d="M0 12 Q25 15 50 8 T100 6" fill="none" stroke="#3b82f6" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>

      {/* 4. Full-Width Attendance History Card */}
      <div className="att-card history-table-card">
        <div className="table-controls-row">
          <h2 className="card-title">Attendance History</h2>

          <div className="filter-controls-group">
            <select
              className="filter-select"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label="Filter by Month"
            >
              <option value="All">July 2026</option>
              <option value="June">June 2026</option>
              <option value="May">May 2026</option>
            </select>

            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by Status"
            >
              <option value="All">All Status</option>
              <option value="Working">Working</option>
              <option value="Completed">Completed</option>
            </select>

            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
          </div>
        </div>

        {/* History Table */}
        <div className="history-table-wrapper">
          <table className="att-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Worked</th>
                <th>Location</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistory.map((log) => {
                const isWorking = !log.check_out_at;
                const durationSec = calculateAttendanceDurationSec(log.check_in_at, log.check_out_at, { allowLive: isWorking, currentTime });
                return (
                  <tr key={log.id}>
                    <td className="font-semibold">{formatDateReadable(log.check_in_at)}</td>
                    <td>{formatTimeOnly(log.check_in_at)}</td>
                    <td>{formatTimeOnly(log.check_out_at)}</td>
                    <td>
                      {isWorking ? (
                        <span className="duration-pill pill-live">Live</span>
                      ) : (
                        <span className="duration-text">{formatDuration(durationSec)}</span>
                      )}
                    </td>
                    <td>
                      <span className="location-cell">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 14, height: 14, color: '#10b981' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        Main Office
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge-table ${isWorking ? 'table-working' : 'table-completed'}`}>
                        {isWorking ? 'Working' : 'Completed'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="table-actions-cell">
                        <button className="icon-action-btn" title="View Details">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 15, height: 15 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                        <button className="icon-action-btn" title="More Actions">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 15, height: 15 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedHistory.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                    No attendance records found matching current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="table-pagination-footer">
          <span className="pagination-info">
            Showing {totalEntries > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to{' '}
            {Math.min(currentPage * itemsPerPage, totalEntries)} of {totalEntries} entries
          </span>
          <div className="pagination-buttons">
            <button
              className="page-nav-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              &larr;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`page-num-btn ${currentPage === p ? 'active' : ''}`}
                onClick={() => setCurrentPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="page-nav-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
