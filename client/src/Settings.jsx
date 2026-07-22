import React, { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './Settings.css';

// Fix Leaflet marker icon issue in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Map auto-center component
function RecenterAutomatically({lat, lng}) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null) {
      map.setView([lat, lng], 15);
    }
  }, [lat, lng, map]);
  return null;
}

const Settings = ({ token }) => {
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState(200);
  const [leaveNoticeDays, setLeaveNoticeDays] = useState(3);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState(null);

  const showStatus = (msg, type) => {
    setStatusMessage(msg);
    setStatusType(type);
    if (type === 'success') {
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/admin/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setLat(data.location_lat !== null ? data.location_lat : '');
        setLng(data.location_lng !== null ? data.location_lng : '');
        setRadius(data.location_radius_m !== null ? data.location_radius_m : 200);
        setLeaveNoticeDays(data.leave_notice_days !== null && data.leave_notice_days !== undefined ? data.leave_notice_days : 3);
      } else {
        showStatus('Failed to load settings', 'error');
      }
    } catch (_err) {
      showStatus('Network error while loading settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [token]);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showStatus('Geolocation is not supported by your browser', 'error');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        showStatus('Location captured successfully', 'success');
      },
      (error) => {
        showStatus('Failed to get location. Please check browser permissions.', 'error');
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseFloat(radius);
    const parsedNoticeDays = parseInt(leaveNoticeDays);

    if (isNaN(parsedLat) || isNaN(parsedLng) || isNaN(parsedRadius) || isNaN(parsedNoticeDays)) {
      showStatus('Please enter valid numbers for coordinates, radius, and notice period', 'error');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/admin/settings`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          location_lat: parsedLat,
          location_lng: parsedLng,
          location_radius_m: parsedRadius,
          leave_notice_days: parsedNoticeDays
        })
      });

      if (response.ok) {
        showStatus('Settings saved successfully', 'success');
      } else {
        const data = await response.json();
        showStatus(data.error || 'Failed to save settings', 'error');
      }
    } catch (err) {
      showStatus('Network error while saving settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayLat = parseFloat(lat);
  const displayLng = parseFloat(lng);
  const hasValidCoordinates = !isNaN(displayLat) && !isNaN(displayLng) && lat !== '' && lng !== '';

  return (
    <div className="settings-container">
      <div className="page-header-container">
        <div className="page-header">
          <h1>Company Settings</h1>
          <p>Configure workplace location for attendance verification.</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner"></div>
          <p>Loading settings...</p>
        </div>
      ) : (
        <div className="settings-grid">
          <div className="settings-form-panel">
            <h3>Office Location</h3>
            <p className="settings-description">
              Set the GPS coordinates for your main office. This is used to verify employee check-ins.
            </p>

            {statusMessage && (
              <div className={`status-banner ${statusType}`}>
                {statusType === 'error' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="banner-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="banner-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{statusMessage}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="settings-form">
              <div className="form-group-row">
                <div className="form-group flex-1">
                  <label className="form-label">Latitude</label>
                  <input 
                    type="number" 
                    step="any"
                    className="input-field" 
                    value={lat} 
                    onChange={e => setLat(e.target.value)}
                    placeholder="e.g. 37.7749"
                    required
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Longitude</label>
                  <input 
                    type="number" 
                    step="any"
                    className="input-field" 
                    value={lng} 
                    onChange={e => setLng(e.target.value)}
                    placeholder="e.g. -122.4194"
                    required
                  />
                </div>
              </div>

              <div className="form-actions-inline">
                <button type="button" className="btn-secondary btn-sm" onClick={handleUseCurrentLocation}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{width: 16, height: 16}}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  Use my current location
                </button>
              </div>

              <div className="form-group mt-4">
                <label className="form-label">Allowed Radius (meters)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={radius} 
                  onChange={e => setRadius(e.target.value)}
                  min="10"
                  required
                />
                <p className="field-help-text">
                  Employees checking in from outside this distance will be rejected. A wider radius accounts for GPS accuracy indoors.
                </p>
              </div>

              <div className="form-group mt-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '20px' }}>
                <label className="form-label">Leave Notice Period</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                  <span>Employees must request leave at least</span>
                  <input 
                    type="number" 
                    className="input-field" 
                    style={{ width: '80px', display: 'inline-block', textAlign: 'center', padding: '8px' }}
                    value={leaveNoticeDays} 
                    onChange={e => setLeaveNoticeDays(e.target.value)}
                    min="0"
                    required
                  />
                  <span>days in advance.</span>
                </div>
                <p className="field-help-text" style={{ marginTop: '8px' }}>
                  Restricts non-emergency leave requests that fall within this window.
                </p>
              </div>

              <div className="form-submit-container">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>

          <div className="settings-map-panel">
            <div className="map-wrapper settings-map">
              <MapContainer 
                center={hasValidCoordinates ? [displayLat, displayLng] : [0, 0]} 
                zoom={hasValidCoordinates ? 15 : 2} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {hasValidCoordinates && (
                  <>
                    <RecenterAutomatically lat={displayLat} lng={displayLng} />
                    <Marker position={[displayLat, displayLng]} />
                  </>
                )}
              </MapContainer>
            </div>
            {!hasValidCoordinates && (
              <div className="map-overlay-message">
                <p>Location not set</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
