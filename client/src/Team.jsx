import { useState, useEffect } from 'react';
import { API_URL } from './config/api';
import './Team.css';

const Team = ({ token, decoded }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ username: '', tempPassword: '', role: 'operator' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [successDetails, setSuccessDetails] = useState(null);

  // Access Control Modal States
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
  const [selectedUserForAccess, setSelectedUserForAccess] = useState(null);
  const [accessForm, setAccessForm] = useState({
    attendance: true,
    leaveRequests: true,
    payroll: true,
    sopLibrary: true
  });
  const [accessSaveLoading, setAccessSaveLoading] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [accessSuccess, setAccessSuccess] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to load team members.');
        return;
      }
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
      setError('Could not connect to server to fetch users.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    const adminPassword = window.prompt(`Are you sure you want to delete user "${username}"?\n\nPlease enter your login password to confirm:`);
    if (adminPassword === null) {
      return; // user clicked Cancel
    }
    if (!adminPassword.trim()) {
      setError('Admin password is required to confirm deletion.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setError('');
    try {
      const response = await fetch(`${API_URL}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ adminPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to delete user.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      setUsers(prev => prev.filter(user => user.id !== userId));
    } catch (err) {
      console.error(err);
      setError('Could not connect to server to delete user.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleOpenManageAccess = (user) => {
    setSelectedUserForAccess(user);
    const perms = user.page_permissions || {};
    setAccessForm({
      attendance: perms.attendance !== false,
      leaveRequests: perms.leaveRequests !== false,
      payroll: perms.payroll !== false,
      sopLibrary: perms.sopLibrary !== false
    });
    setAccessError('');
    setAccessSuccess(false);
    setIsAccessModalOpen(true);
  };

  const handleSaveAccess = async () => {
    setAccessSaveLoading(true);
    setAccessError('');
    setAccessSuccess(false);
    try {
      const response = await fetch(`${API_URL}/admin/users/${selectedUserForAccess.id}/permissions`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ permissions: accessForm })
      });
      const data = await response.json();
      if (!response.ok) {
        setAccessError(data.error || 'Failed to update access permissions.');
        return;
      }
      
      setUsers(prev => prev.map(u => u.id === selectedUserForAccess.id ? { ...u, page_permissions: accessForm } : u));
      setAccessSuccess(true);
      setTimeout(() => {
        setIsAccessModalOpen(false);
      }, 800);
    } catch (err) {
      console.error(err);
      setAccessError('Could not connect to server.');
    } finally {
      setAccessSaveLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.username || !addForm.tempPassword || !addForm.role) {
      setAddError('All fields are required.');
      return;
    }
    setAddLoading(true);
    setAddError('');
    setSuccessDetails(null);

    try {
      const response = await fetch(`${API_URL}/admin/users`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(addForm)
      });
      const data = await response.json();
      
      if (!response.ok) {
        setAddError(data.error || 'Failed to create user.');
        return;
      }
      
      setUsers(prev => [data, ...prev]);
      setSuccessDetails({ username: addForm.username, tempPassword: addForm.tempPassword });
      setAddForm({ username: '', tempPassword: '', role: 'operator' });
    } catch (err) {
      console.error(err);
      setAddError('Could not connect to server.');
    } finally {
      setAddLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="status-badge status-success">Active</span>;
      case 'invited':
        return <span className="status-badge status-warning">Invited</span>;
      case 'disabled':
        return <span className="status-badge status-neutral">Disabled</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  return (
    <div className="team-container">
      <div className="page-header-container">
        <div className="page-header">
          <h1>Team Management</h1>
          <p>Manage employees and their access levels within the workspace.</p>
        </div>
        <button 
          className="btn-primary" 
          onClick={() => {
            setIsAddModalOpen(true);
            setSuccessDetails(null);
            setAddError('');
          }}
        >
          + Add Employee
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="loading-spinner-container">
          <div className="spinner"></div>
          <p>Loading team members...</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar-sm">{user.username.substring(0, 2).toUpperCase()}</div>
                      <span className="user-name-text">{user.username}</span>
                    </div>
                  </td>
                  <td><span className="role-text">{user.role}</span></td>
                  <td>{getStatusBadge(user.status)}</td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button 
                        className="btn-secondary-sm"
                        style={{
                          padding: '6px 12px',
                          fontSize: '13px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius)',
                          cursor: 'pointer',
                          background: 'var(--surface)',
                          color: 'var(--text-h)',
                          border: '1px solid var(--border)',
                          transition: 'all 0.2s ease',
                          fontFamily: 'var(--sans)'
                        }}
                        onClick={() => handleOpenManageAccess(user)}
                      >
                        Manage Access
                      </button>
                      {user.id !== decoded?.userId ? (
                        <button 
                          className="btn-danger-sm"
                          onClick={() => handleDeleteUser(user.id, user.username)}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="text-muted-sm">(You)</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="5" className="empty-state-cell">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isAddModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Add New Employee</h2>
              <button className="btn-close" onClick={() => setIsAddModalOpen(false)}>
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              {successDetails ? (
                <div className="success-banner">
                  <h3>User Created Successfully!</h3>
                  <p>Please share these credentials securely with the new employee. They will not be shown again.</p>
                  <div className="credentials-box">
                    <p><strong>Username:</strong> {successDetails.username}</p>
                    <p><strong>Password:</strong> {successDetails.tempPassword}</p>
                  </div>
                  <button className="btn-primary" onClick={() => setIsAddModalOpen(false)} style={{width: '100%', marginTop: '16px'}}>
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAddSubmit}>
                  {addError && <div className="error-banner">{addError}</div>}
                  
                  <div className="form-group">
                    <label className="form-label">Username</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={addForm.username} 
                      onChange={e => setAddForm({...addForm, username: e.target.value})}
                      placeholder="e.g. jsmith"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Temporary Password</label>
                    <input 
                      type="text" 
                      className="input-field" 
                      value={addForm.tempPassword} 
                      onChange={e => setAddForm({...addForm, tempPassword: e.target.value})}
                      placeholder="At least 8 characters"
                      required
                      minLength={8}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select 
                      className="input-field" 
                      value={addForm.role}
                      onChange={e => setAddForm({...addForm, role: e.target.value})}
                    >
                      <option value="employee">Employee</option>
                      <option value="operator">Operator</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="auditor">Auditor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  
                  <div className="modal-actions">
                    <button type="button" className="btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
                    <button type="submit" className="btn-primary" disabled={addLoading}>
                      {addLoading ? 'Creating...' : 'Create Employee'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {isAccessModalOpen && selectedUserForAccess && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Manage Access: {selectedUserForAccess.username}</h2>
              <button className="btn-close" onClick={() => setIsAccessModalOpen(false)}>
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
                Toggle page visibility for this employee. Role-based restrictions are still active.
              </p>
              
              {accessError && <div className="error-banner" style={{ marginBottom: '16px' }}>{accessError}</div>}
              {accessSuccess && (
                <div className="success-banner" style={{ marginBottom: '16px', padding: '12px' }}>
                  <h3>Permissions Updated!</h3>
                </div>
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-h)', fontSize: '15px' }}>Attendance</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>GPS clock-ins and records</span>
                  </div>
                  <input 
                    id="toggle-attendance"
                    type="checkbox" 
                    checked={accessForm.attendance} 
                    onChange={e => setAccessForm({...accessForm, attendance: e.target.checked})}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-h)', fontSize: '15px' }}>Leave Requests</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Leave requests form and status</span>
                  </div>
                  <input 
                    id="toggle-leave-requests"
                    type="checkbox" 
                    checked={accessForm.leaveRequests} 
                    onChange={e => setAccessForm({...accessForm, leaveRequests: e.target.checked})}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-h)', fontSize: '15px' }}>Payroll</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Hourly rates and payouts calculation</span>
                  </div>
                  <input 
                    id="toggle-payroll"
                    type="checkbox" 
                    checked={accessForm.payroll} 
                    onChange={e => setAccessForm({...accessForm, payroll: e.target.checked})}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div>
                    <strong style={{ display: 'block', color: 'var(--text-h)', fontSize: '15px' }}>SOP Library</strong>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Procedures and checklists templates</span>
                  </div>
                  <input 
                    id="toggle-sop-library"
                    type="checkbox" 
                    checked={accessForm.sopLibrary} 
                    onChange={e => setAccessForm({...accessForm, sopLibrary: e.target.checked})}
                  />
                </div>
              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setIsAccessModalOpen(false)}>Cancel</button>
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={handleSaveAccess}
                  disabled={accessSaveLoading}
                >
                  {accessSaveLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Team;
