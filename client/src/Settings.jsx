import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from './config/api';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
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

// Map auto-center & Leaflet resize component
function RecenterAutomatically({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], 15);
    }
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [lat, lng, map]);
  return null;
}

const Settings = ({ token, showToast }) => {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState('profile');
  const scrollRef = useRef(null);
  const cancelBtnRef = useRef(null);

  // Server state & initial snapshot
  const [initialData, setInitialData] = useState(null);

  // Editable Form fields
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('admin@workspace.com');
  const [companyPhone, setCompanyPhone] = useState('+94 11 234 5678');
  const [companyAddress, setCompanyAddress] = useState('123 Enterprise Way, Colombo 03');
  const [country, setCountry] = useState('Sri Lanka');
  const [timeZone, setTimeZone] = useState('Asia/Colombo (UTC+05:30)');
  const [dateFormat, setDateFormat] = useState('YYYY-MM-DD');

  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState(200);
  const [leaveNoticeDays, setLeaveNoticeDays] = useState(3);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusType, setStatusType] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [validationError, setValidationError] = useState('');

  const showStatus = (msg, type) => {
    setStatusMessage(msg);
    setStatusType(type);
    if (type === 'success') {
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    setValidationError('');
    try {
      const response = await fetch(`${API_URL}/admin/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setInitialData(data);
        
        setCompanyName(data.name || 'SOP SaaS Workspace');
        setLat(data.location_lat !== null && data.location_lat !== undefined ? data.location_lat : '');
        setLng(data.location_lng !== null && data.location_lng !== undefined ? data.location_lng : '');
        setRadius(data.location_radius_m !== null && data.location_radius_m !== undefined ? data.location_radius_m : 200);
        setLeaveNoticeDays(data.leave_notice_days !== null && data.leave_notice_days !== undefined ? data.leave_notice_days : 3);
      } else {
        showStatus('Failed to load company settings', 'error');
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

  // Accessibility & Focus trap for Confirmation Modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showConfirmModal && !saving) {
        setShowConfirmModal(false);
      }
    };
    if (showConfirmModal) {
      window.addEventListener('keydown', handleKeyDown);
      setTimeout(() => {
        if (cancelBtnRef.current) {
          cancelBtnRef.current.focus();
        }
      }, 50);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showConfirmModal, saving]);

  // Handle Tab Switch with Smooth Top Scroll & Map Resizing Trigger
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (tabId === 'geofence') {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 120);
    }
  };

  // Check if form is dirty (modified from server baseline)
  const isDirty = initialData && (
    companyName.trim() !== (initialData.name || '') ||
    String(lat) !== String(initialData.location_lat !== null ? initialData.location_lat : '') ||
    String(lng) !== String(initialData.location_lng !== null ? initialData.location_lng : '') ||
    String(radius) !== String(initialData.location_radius_m !== null ? initialData.location_radius_m : 200) ||
    String(leaveNoticeDays) !== String(initialData.leave_notice_days !== null ? initialData.leave_notice_days : 3) ||
    companyEmail !== 'admin@workspace.com' ||
    companyPhone !== '+94 11 234 5678' ||
    companyAddress !== '123 Enterprise Way, Colombo 03' ||
    country !== 'Sri Lanka'
  );

  // Compute changed fields with Old -> New values comparison
  const getChangedFields = () => {
    if (!initialData) return [];
    const list = [];

    const serverName = initialData.name || '';
    if (companyName.trim() !== serverName) {
      list.push({
        label: 'Company Name',
        oldVal: serverName || 'Not set',
        newVal: companyName.trim()
      });
    }

    const serverLat = initialData.location_lat !== null && initialData.location_lat !== undefined ? String(initialData.location_lat) : '';
    if (String(lat) !== serverLat) {
      list.push({
        label: 'Workplace Latitude',
        oldVal: serverLat ? `${serverLat}°` : 'Not set',
        newVal: lat ? `${lat}°` : 'Not set'
      });
    }

    const serverLng = initialData.location_lng !== null && initialData.location_lng !== undefined ? String(initialData.location_lng) : '';
    if (String(lng) !== serverLng) {
      list.push({
        label: 'Workplace Longitude',
        oldVal: serverLng ? `${serverLng}°` : 'Not set',
        newVal: lng ? `${lng}°` : 'Not set'
      });
    }

    const serverRadius = initialData.location_radius_m !== null && initialData.location_radius_m !== undefined ? String(initialData.location_radius_m) : '200';
    if (String(radius) !== serverRadius) {
      list.push({
        label: 'Allowed Check-in Radius',
        oldVal: `${serverRadius} m`,
        newVal: `${radius} m`
      });
    }

    const serverNotice = initialData.leave_notice_days !== null && initialData.leave_notice_days !== undefined ? String(initialData.leave_notice_days) : '3';
    if (String(leaveNoticeDays) !== serverNotice) {
      list.push({
        label: 'Leave Notice Period',
        oldVal: `${serverNotice} days`,
        newVal: `${leaveNoticeDays} days`
      });
    }

    return list;
  };

  const handleReset = () => {
    if (!initialData) return;
    setCompanyName(initialData.name || '');
    setCompanyEmail('admin@workspace.com');
    setCompanyPhone('+94 11 234 5678');
    setCompanyAddress('123 Enterprise Way, Colombo 03');
    setCountry('Sri Lanka');
    setTimeZone('Asia/Colombo (UTC+05:30)');
    setDateFormat('YYYY-MM-DD');

    setLat(initialData.location_lat !== null ? initialData.location_lat : '');
    setLng(initialData.location_lng !== null ? initialData.location_lng : '');
    setRadius(initialData.location_radius_m !== null ? initialData.location_radius_m : 200);
    setLeaveNoticeDays(initialData.leave_notice_days !== null ? initialData.leave_notice_days : 3);
    setValidationError('');
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showStatus('Geolocation is not supported by your browser', 'error');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        showStatus('Workplace location captured from browser GPS', 'success');
      },
      (_err) => {
        showStatus('Failed to capture location. Please verify browser location permissions.', 'error');
      },
      { enableHighAccuracy: true }
    );
  };

  const validateForm = () => {
    if (!companyName.trim()) {
      return 'Company Name cannot be empty.';
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseFloat(radius);
    const parsedNoticeDays = parseInt(leaveNoticeDays);

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      return 'Latitude must be a valid coordinate between -90° and +90°.';
    }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      return 'Longitude must be a valid coordinate between -180° and +180°.';
    }
    if (isNaN(parsedRadius) || parsedRadius < 10) {
      return 'Geofence Radius must be at least 10 meters.';
    }
    if (isNaN(parsedNoticeDays) || parsedNoticeDays < 0) {
      return 'Leave Notice Days must be 0 or a positive number.';
    }

    return null;
  };

  const handleSaveClick = (e) => {
    e.preventDefault();
    const errorMsg = validateForm();
    if (errorMsg) {
      setValidationError(errorMsg);
      return;
    }
    setValidationError('');

    const sensitiveChanged = initialData && (
      String(radius) !== String(initialData.location_radius_m) ||
      String(leaveNoticeDays) !== String(initialData.leave_notice_days)
    );

    if (sensitiveChanged) {
      setShowConfirmModal(true);
    } else {
      executeSave();
    }
  };

  const executeSave = async () => {
    setSaving(true);
    setStatusMessage(null);

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseFloat(radius);
    const parsedNoticeDays = parseInt(leaveNoticeDays);

    try {
      const response = await fetch(`${API_URL}/admin/settings`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          name: companyName.trim(),
          location_lat: parsedLat,
          location_lng: parsedLng,
          location_radius_m: parsedRadius,
          leave_notice_days: parsedNoticeDays
        })
      });

      const data = await response.json();

      if (response.ok) {
        setShowConfirmModal(false);
        setInitialData(data);
        setCompanyName(data.name || '');
        setLat(data.location_lat !== null && data.location_lat !== undefined ? data.location_lat : '');
        setLng(data.location_lng !== null && data.location_lng !== undefined ? data.location_lng : '');
        setRadius(data.location_radius_m !== null && data.location_radius_m !== undefined ? data.location_radius_m : 200);
        setLeaveNoticeDays(data.leave_notice_days !== null && data.leave_notice_days !== undefined ? data.leave_notice_days : 3);

        const successTitle = 'Company Settings Updated';
        const successMsg = 'Your company settings were saved successfully.';
        showStatus(successMsg, 'success');
        if (showToast) {
          showToast({
            title: successTitle,
            message: successMsg,
            type: 'success'
          });
        }
      } else {
        const errorTitle = 'Unable to Save Settings';
        const errorMsg = "We couldn't update the company settings. Please try again.";
        showStatus(errorMsg, 'error');
        if (showToast) {
          showToast({
            title: errorTitle,
            message: errorMsg,
            type: 'error'
          });
        }
      }
    } catch (_err) {
      const errorTitle = 'Unable to Save Settings';
      const errorMsg = "We couldn't update the company settings. Please try again.";
      showStatus(errorMsg, 'error');
      if (showToast) {
        showToast({
          title: errorTitle,
          message: errorMsg,
          type: 'error'
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const parsedRadius = parseFloat(radius);
  const hasValidCoordinates = !isNaN(parsedLat) && !isNaN(parsedLng) && lat !== '' && lng !== '';
  const displayLat = hasValidCoordinates ? parsedLat : 6.927079;
  const displayLng = hasValidCoordinates ? parsedLng : 79.861244;
  const displayRadius = !isNaN(parsedRadius) && parsedRadius > 0 ? parsedRadius : 200;

  const changedFieldsList = getChangedFields();

  return (
    <div className="settings-page">
      {/* 1. Header Section */}
      <div className="settings-header-section">
        <div>
          <h2 className="settings-page-title">Company Settings</h2>
          <p className="settings-page-subtitle">Configure organization profile, geofenced attendance parameters, and leave rules.</p>
        </div>
        {isDirty && (
          <div className="dirty-indicator-chip" role="status" aria-live="polite">
            <span className="dirty-dot" />
            Unsaved Changes
          </div>
        )}
      </div>

      {/* Status Banners / Validation Alert */}
      {validationError && (
        <div className="status-banner error">
          <span>{validationError}</span>
          <button className="status-close-btn" onClick={() => setValidationError('')} aria-label="Close error banner">×</button>
        </div>
      )}

      {statusMessage && (
        <div className={`status-banner ${statusType === 'error' ? 'error' : 'success'}`}>
          <span>{statusMessage}</span>
          <button className="status-close-btn" onClick={() => setStatusMessage(null)} aria-label="Close status message">×</button>
        </div>
      )}

      {loading ? (
        <div className="settings-panel-card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Loading company configuration...</p>
        </div>
      ) : (
        <>
          {/* 2. Navigation Tabs */}
          <div className="settings-tabs-nav" role="tablist">
            <button 
              role="tab"
              aria-selected={activeTab === 'profile'}
              className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => handleTabChange('profile')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16, marginRight: 6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5s.75 0 .75.75v1.5c0 .75-.75.75-.75.75H9m0-3H7.5m3 0h1.5m-4.5 6h1.5s.75 0 .75.75v1.5c0 .75-.75.75-.75.75H9m0-3H7.5m3 0h1.5m-4.5 6h1.5s.75 0 .75.75v1.5c0 .75-.75.75-.75.75H9m0-3H7.5m3 0h1.5" />
              </svg>
              Company Profile
            </button>

            <button 
              role="tab"
              aria-selected={activeTab === 'geofence'}
              className={`settings-tab-btn ${activeTab === 'geofence' ? 'active' : ''}`}
              onClick={() => handleTabChange('geofence')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16, marginRight: 6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              Attendance Geofencing
            </button>

            <button 
              role="tab"
              aria-selected={activeTab === 'leave'}
              className={`settings-tab-btn ${activeTab === 'leave' ? 'active' : ''}`}
              onClick={() => handleTabChange('leave')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16, marginRight: 6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Leave Policy
            </button>

            <button 
              role="tab"
              aria-selected={activeTab === 'security'}
              className={`settings-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => handleTabChange('security')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16, marginRight: 6 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              Security & Audit
            </button>
          </div>

          {/* 3. Scrollable Content Area */}
          <div className="settings-scroll-area" ref={scrollRef}>
            {/* TAB 1: Company Profile */}
            {activeTab === 'profile' && (
              <div className="settings-panel-card">
                <div className="card-section-header">
                  <h3 className="section-title">Company Profile</h3>
                  <p className="section-desc">Manage organization identity, contact details, headquarters location, and locale parameters.</p>
                </div>

                <div className="settings-form-grid">
                  <div className="form-group full-width">
                    <label className="form-label" htmlFor="company-name-input">
                      Company / Organization Name <span className="required-asterisk">*</span>
                    </label>
                    <span className="form-helper-text">Displayed on payroll reports, page headers, and workspace notifications.</span>
                    <input 
                      id="company-name-input"
                      type="text" 
                      className="input-field" 
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      placeholder="Enter organization name"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="company-email-input">Company Email</label>
                    <input 
                      id="company-email-input"
                      type="email" 
                      className="input-field" 
                      value={companyEmail}
                      onChange={e => setCompanyEmail(e.target.value)}
                      placeholder="admin@organization.com"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="company-phone-input">Company Phone</label>
                    <input 
                      id="company-phone-input"
                      type="text" 
                      className="input-field" 
                      value={companyPhone}
                      onChange={e => setCompanyPhone(e.target.value)}
                      placeholder="+94 11 234 5678"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label" htmlFor="company-address-input">Headquarters Address</label>
                    <input 
                      id="company-address-input"
                      type="text" 
                      className="input-field" 
                      value={companyAddress}
                      onChange={e => setCompanyAddress(e.target.value)}
                      placeholder="123 Enterprise Way, Colombo 03"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="company-country-input">Country / Region</label>
                    <input 
                      id="company-country-input"
                      type="text" 
                      className="input-field" 
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      placeholder="Sri Lanka"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="company-timezone-input">Time Zone</label>
                    <input 
                      id="company-timezone-input"
                      type="text" 
                      className="input-field disabled" 
                      value={timeZone}
                      disabled
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="company-currency-input">Primary Currency</label>
                    <input 
                      id="company-currency-input"
                      type="text" 
                      className="input-field disabled" 
                      value="LKR - Sri Lankan Rupees (Rs.)" 
                      disabled 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="company-dateformat-input">Date Format</label>
                    <input 
                      id="company-dateformat-input"
                      type="text" 
                      className="input-field disabled" 
                      value={dateFormat}
                      disabled 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Attendance Geofencing */}
            {activeTab === 'geofence' && (
              <div className="settings-panel-card">
                <div className="card-section-header">
                  <h3 className="section-title">Geofenced Attendance Verification</h3>
                  <p className="section-desc">Set the office location and check-in radius for attendance verification.</p>
                </div>

                <div className="settings-form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="geofence-lat-input">
                      Workplace Latitude (°N/S) <span className="required-asterisk">*</span>
                    </label>
                    <input 
                      id="geofence-lat-input"
                      type="number" 
                      step="any"
                      className="input-field" 
                      value={lat}
                      onChange={e => setLat(e.target.value)}
                      placeholder="e.g. 6.927079"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="geofence-lng-input">
                      Workplace Longitude (°E/W) <span className="required-asterisk">*</span>
                    </label>
                    <input 
                      id="geofence-lng-input"
                      type="number" 
                      step="any"
                      className="input-field" 
                      value={lng}
                      onChange={e => setLng(e.target.value)}
                      placeholder="e.g. 79.861244"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label" htmlFor="geofence-radius-input">
                      Allowed Check-in Radius (Meters) <span className="required-asterisk">*</span>
                    </label>
                    <span className="form-helper-text">Employees must be inside this radius to check in.</span>
                    <div className="input-unit-wrapper">
                      <input 
                        id="geofence-radius-input"
                        type="number" 
                        min="10"
                        step="10"
                        className="input-field" 
                        value={radius}
                        onChange={e => setRadius(e.target.value)}
                        placeholder="e.g. 200"
                      />
                      <span className="unit-tag">Meters</span>
                    </div>
                  </div>
                </div>

                {/* Map Toolbar & Compact Canvas */}
                <div className="geofence-map-card">
                  <div className="map-card-header">
                    <div className="map-header-left">
                      <h4 className="map-title">Workplace Geofence Map</h4>
                      {hasValidCoordinates ? (
                        <span className="coords-badge">GPS: {displayLat.toFixed(5)}, {displayLng.toFixed(5)}</span>
                      ) : (
                        <span className="coords-badge warning">Coordinates Not Set</span>
                      )}
                    </div>

                    <button className="btn-secondary compact-btn" onClick={handleUseCurrentLocation}>
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 14, height: 14, marginRight: 6 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      Use My GPS Location
                    </button>
                  </div>

                  {hasValidCoordinates ? (
                    <div className="map-wrapper geofence-map">
                      <MapContainer 
                        center={[displayLat, displayLng]} 
                        zoom={15} 
                        style={{ width: '100%', height: '100%' }}
                        scrollWheelZoom={false}
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker 
                          position={[displayLat, displayLng]} 
                          draggable={true}
                          eventhandlers={{
                            dragend: (e) => {
                              const marker = e.target;
                              const position = marker.getLatLng();
                              setLat(position.lat);
                              setLng(position.lng);
                            }
                          }}
                        />
                        <Circle 
                          center={[displayLat, displayLng]} 
                          radius={displayRadius}
                          pathOptions={{ color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.2 }}
                        />
                        <RecenterAutomatically lat={displayLat} lng={displayLng} />
                      </MapContainer>
                    </div>
                  ) : (
                    <div className="map-placeholder">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 40, height: 40, color: 'var(--text-muted)', marginBottom: 8 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      <p>Enter valid Latitude & Longitude or click "Use My GPS Location" to visualize geofence preview.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Leave Policy */}
            {activeTab === 'leave' && (
              <div className="settings-panel-card">
                <div className="card-section-header">
                  <h3 className="section-title">Leave Policy & Advance Notice</h3>
                  <p className="section-desc">Set the minimum notice required for standard leave requests.</p>
                </div>

                <div className="settings-form-grid">
                  <div className="form-group full-width">
                    <label className="form-label" htmlFor="leave-notice-input">
                      Minimum Leave Notice Period (Days) <span className="required-asterisk">*</span>
                    </label>
                    <div className="input-unit-wrapper">
                      <input 
                        id="leave-notice-input"
                        type="number" 
                        min="0"
                        className="input-field" 
                        value={leaveNoticeDays}
                        onChange={e => setLeaveNoticeDays(e.target.value)}
                        placeholder="e.g. 3"
                      />
                      <span className="unit-tag">Days</span>
                    </div>
                  </div>
                </div>

                <div className="emergency-policy-card">
                  <h4 className="policy-card-title">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16, color: 'var(--primary)' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                    Emergency Leave Classification
                  </h4>
                  <p>
                    Requests submitted inside the notice period are marked as Emergency Requests for manager review.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: Security */}
            {activeTab === 'security' && (
              <div className="settings-panel-card">
                <div className="card-section-header">
                  <h3 className="section-title">Security & Audit Compliance Policy</h3>
                  <p className="section-desc">Active server-side security controls, tenant isolation, and audit logging parameters.</p>
                </div>

                <div className="security-cards-grid">
                  <div className="sec-info-card">
                    <div className="sec-icon icon-purple">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                      </svg>
                    </div>
                    <div className="sec-content">
                      <h4>Server-Side RBAC Enforcement</h4>
                      <p>All setting updates require active JWT authentication and admin role authorization.</p>
                    </div>
                  </div>

                  <div className="sec-info-card">
                    <div className="sec-icon icon-blue">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="sec-content">
                      <h4>Immutable Audit Logging</h4>
                      <p>Every setting modification logs old/new values, actor ID, IP address, and timestamp.</p>
                    </div>
                  </div>

                  <div className="sec-info-card">
                    <div className="sec-icon icon-green">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                    <div className="sec-content">
                      <h4>Tenant Data Isolation</h4>
                      <p>PostgreSQL Row-Level Security (RLS) ensures settings are strictly scoped per workspace.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. Action Bar (Row 4 in Page Shell Grid - Distinct Bottom Bar, Non-overlapping) */}
          <div className="settings-action-bar">
            <div className="action-bar-left">
              {isDirty ? (
                <span className="dirty-text" role="status" aria-live="polite">You have unsaved changes in company settings.</span>
              ) : (
                <span className="saved-text" role="status" aria-live="polite">All changes saved.</span>
              )}
            </div>
            <div className="action-bar-right">
              <button 
                type="button"
                className="btn-secondary" 
                onClick={handleReset} 
                disabled={!isDirty || saving}
              >
                Discard Changes
              </button>
              <button 
                type="button"
                className="btn-primary" 
                onClick={handleSaveClick} 
                disabled={!isDirty || saving}
              >
                {saving ? 'Saving...' : 'Save Company Settings'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Redesigned Enterprise Confirmation Modal */}
      {showConfirmModal && (
        <div 
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setShowConfirmModal(false);
            }
          }}
        >
          <div 
            className="confirm-modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
          >
            {/* Header */}
            <div className="modal-header-row">
              <div className="modal-header-icon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 22, height: 22 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div className="modal-header-text">
                <h3 id="confirm-modal-title">Confirm Settings Update</h3>
                <p>Review the changes before applying them to your organization.</p>
              </div>
            </div>

            {/* Warning Callout Box */}
            <div className="modal-warning-callout">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="modal-warning-icon">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <span>Changes to attendance location, check-in radius, or leave rules may affect employee check-ins and leave requests immediately.</span>
            </div>

            {/* Changes Summary (Old -> New comparison for modified fields only) */}
            <div className="modal-changes-section">
              <h4 className="modal-changes-title">Changes to be applied</h4>
              {changedFieldsList.length > 0 ? (
                <div className="changes-summary-list">
                  {changedFieldsList.map((item, idx) => (
                    <div key={idx} className="change-item-row">
                      <span className="change-item-label">{item.label}</span>
                      <div className="change-item-values">
                        <span className="old-val">{item.oldVal}</span>
                        <span className="val-arrow">→</span>
                        <span className="new-val">{item.newVal}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No setting fields modified.</p>
              )}
            </div>

            {/* Actions */}
            <div className="modal-actions-row">
              <button 
                ref={cancelBtnRef}
                type="button"
                className="btn-secondary" 
                onClick={() => setShowConfirmModal(false)} 
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                type="button"
                className="btn-primary" 
                onClick={executeSave} 
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
