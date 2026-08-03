import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from './config/api';
import './SopLibrary.css';
import ChecklistRun from './ChecklistRun';

const PRESET_CATEGORIES = [
  'Operations',
  'Safety',
  'Quality Control',
  'Maintenance',
  'Compliance',
  'General'
];

const SopLibrary = ({ token, decoded, showToast, refreshKey }) => {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Toolbar & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;

  // Builder / Editor State
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [currentSopId, setCurrentSopId] = useState(null);
  const [initialStatus, setInitialStatus] = useState('draft');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Operations');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState([{ description: '', requiresPhoto: false }]);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Active Checklist Run State
  const [activeRunSopId, setActiveRunSopId] = useState(null);

  // User Roles
  const isAdmin = decoded?.role === 'admin';
  const isAuditor = decoded?.role === 'auditor';

  // Assignment Modal State
  const [assigningSop, setAssigningSop] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');

  // Delete Safety Modal State
  const [deletingSop, setDeletingSop] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Ref for auto-focusing newly added step
  const lastStepRef = useRef(null);

  // Fetch SOPs list
  const fetchSops = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/sops`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load SOP library.');
      } else {
        setSops(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
      setError('Network error. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSops();
  }, [token, refreshKey]);

  // Open Assign Modal
  const handleOpenAssignModal = async (sop) => {
    setAssigningSop(sop);
    setSelectedEmployeeId('');
    setAssignError('');
    setAssignSuccess('');
    
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.filter(u => u.status !== 'disabled'));
      } else {
        setAssignError("Failed to fetch employees list.");
      }
    } catch (err) {
      console.error(err);
      setAssignError("Failed to connect to server.");
    }
  };

  const handleCloseAssignModal = () => {
    setAssigningSop(null);
    setEmployees([]);
    setSelectedEmployeeId('');
    setAssignError('');
    setAssignSuccess('');
  };

  const handleAssignSubmit = async () => {
    if (!selectedEmployeeId) return;
    setAssignLoading(true);
    setAssignError('');
    setAssignSuccess('');

    try {
      const res = await fetch(`${API_URL}/checklist-runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          sopId: assigningSop.id,
          operatorId: selectedEmployeeId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setAssignError(data.error || 'Failed to assign SOP.');
      } else {
        setAssignSuccess('SOP assigned successfully!');
        if (showToast) {
          showToast({
            title: 'Assignment Successful',
            message: `Checklist for SOP "${assigningSop.title}" assigned successfully.`,
            type: 'success'
          });
        }
        setTimeout(() => {
          handleCloseAssignModal();
        }, 1200);
      }
    } catch (err) {
      console.error(err);
      const netMsg = 'Network connection error while assigning checklist.';
      setAssignError(netMsg);
      if (showToast) showToast({ title: 'Network Error', message: netMsg, type: 'error' });
    } finally {
      setAssignLoading(false);
    }
  };

  // Delete Safety Handlers
  const handleOpenDeleteModal = (sop, e) => {
    if (e) e.stopPropagation();
    if (!isAdmin) return;
    setDeletingSop(sop);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSop || !isAdmin) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`${API_URL}/sops/${deletingSop.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setSops(prev => prev.filter(s => s.id !== deletingSop.id));
        if (showToast) {
          showToast({
            title: 'Deleted Successfully',
            message: `SOP template "${deletingSop.title}" deleted successfully.`,
            type: 'success'
          });
        }
        setDeletingSop(null);
      } else {
        const data = await res.json();
        const errorMsg = data.error || 'Failed to delete SOP template.';
        if (showToast) {
          showToast({
            title: 'Unable to Delete SOP',
            message: errorMsg,
            type: 'error'
          });
        } else {
          alert(errorMsg);
        }
      }
    } catch (err) {
      console.error(err);
      if (showToast) {
        showToast({
          title: 'Network Error',
          message: 'Network connection error while deleting SOP template.',
          type: 'error'
        });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // Open Builder / Editor
  const openBuilder = (sop = null) => {
    if (!isAdmin && sop) {
      // Non-admins click to view SOP steps
      setActiveRunSopId(sop.id);
      return;
    }
    if (!isAdmin) return;

    setBuilderError('');
    setValidationErrors({});
    setIsFormDirty(false);

    if (sop) {
      setCurrentSopId(sop.id);
      setTitle(sop.title || '');
      
      const rawCategory = sop.category || 'Operations';
      if (PRESET_CATEGORIES.includes(rawCategory)) {
        setCategory(rawCategory);
        setCustomCategory('');
      } else {
        setCategory('Other');
        setCustomCategory(rawCategory);
      }

      const contentObj = sop.content || {};
      setInitialStatus(contentObj.status || 'published');
      setDescription(contentObj.description || '');

      const existingSteps = contentObj.steps || [];
      if (existingSteps.length > 0) {
        setSteps(existingSteps.map(s => ({ description: s.description || '', requiresPhoto: !!s.requiresPhoto })));
      } else {
        setSteps([{ description: '', requiresPhoto: false }]);
      }
    } else {
      setCurrentSopId(null);
      setInitialStatus('draft');
      setTitle('');
      setCategory('Operations');
      setCustomCategory('');
      setDescription('');
      setSteps([{ description: '', requiresPhoto: false }]);
    }
    setIsBuilderOpen(true);
  };

  const closeBuilder = () => {
    if (isFormDirty) {
      const confirmClose = window.confirm("You have unsaved changes in the editor. Are you sure you want to close without saving?");
      if (!confirmClose) return;
    }
    setIsBuilderOpen(false);
    setIsFormDirty(false);
  };

  // Step Management
  const handleAddStep = () => {
    setSteps(prev => [...prev, { description: '', requiresPhoto: false }]);
    setIsFormDirty(true);
    setTimeout(() => {
      if (lastStepRef.current) {
        lastStepRef.current.focus();
        lastStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  };

  const handleRemoveStep = (index) => {
    if (steps.length <= 1) {
      if (showToast) {
        showToast('At least one checklist step is required.', 'warning');
      }
      return;
    }
    const newSteps = [...steps];
    newSteps.splice(index, 1);
    setSteps(newSteps);
    setIsFormDirty(true);
  };

  const handleMoveStepUp = (index) => {
    if (index === 0) return;
    const newSteps = [...steps];
    const temp = newSteps[index - 1];
    newSteps[index - 1] = newSteps[index];
    newSteps[index] = temp;
    setSteps(newSteps);
    setIsFormDirty(true);
  };

  const handleMoveStepDown = (index) => {
    if (index === steps.length - 1) return;
    const newSteps = [...steps];
    const temp = newSteps[index + 1];
    newSteps[index + 1] = newSteps[index];
    newSteps[index] = temp;
    setSteps(newSteps);
    setIsFormDirty(true);
  };

  const handleStepChange = (index, field, value) => {
    const newSteps = [...steps];
    newSteps[index][field] = value;
    setSteps(newSteps);
    setIsFormDirty(true);
  };

  // Validation helper
  const validateForm = (targetStatus) => {
    const errors = {};
    if (!title.trim()) {
      errors.title = 'SOP title is required.';
    }

    const finalCategory = category === 'Other' ? customCategory.trim() : category;
    if (!finalCategory) {
      errors.category = 'Category is required.';
    }

    const validSteps = steps.filter(s => s.description.trim() !== '');
    if (targetStatus === 'published' && validSteps.length === 0) {
      errors.steps = 'At least one valid step instruction is required to publish.';
    } else if (steps.length === 0) {
      errors.steps = 'At least one step is required.';
    }

    setValidationErrors(errors);
    return { isValid: Object.keys(errors).length === 0, finalCategory, validSteps };
  };

  // Save / Publish Handler
  const handleSave = async (status) => {
    const { isValid, finalCategory, validSteps } = validateForm(status);
    if (!isValid) {
      setBuilderError('Please resolve all highlighted fields before proceeding.');
      return;
    }

    setBuilderLoading(true);
    setBuilderError('');

    const payload = {
      title: title.trim(),
      category: finalCategory,
      content: {
        status, // 'draft' or 'published'
        description: description.trim(),
        steps: validSteps.length > 0 ? validSteps : steps.filter(s => s.description.trim() !== '')
      }
    };

    try {
      const url = currentSopId 
        ? `${API_URL}/sops/${currentSopId}` 
        : `${API_URL}/sops`;
      const method = currentSopId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = data.error || 'Failed to save SOP template.';
        setBuilderError(errorMsg);
        if (showToast) {
          showToast({
            title: 'Unable to Save SOP',
            message: errorMsg,
            type: 'error'
          });
        }
      } else {
        setIsFormDirty(false);
        setIsBuilderOpen(false);
        fetchSops(); // refresh list
        if (showToast) {
          if (status === 'published') {
            showToast({
              title: 'Published Successfully',
              message: `SOP "${data.title}" published successfully for team execution.`,
              type: 'success'
            });
          } else {
            showToast({
              title: currentSopId ? 'Updated Successfully' : 'Created Successfully',
              message: `SOP "${data.title}" saved as draft.`,
              type: 'success'
            });
          }
        }
      }
    } catch (err) {
      console.error(err);
      const netMsg = 'Network connection error while saving SOP template.';
      setBuilderError(netMsg);
      if (showToast) {
        showToast({
          title: 'Network Connection Lost',
          message: netMsg,
          type: 'error'
        });
      }
    } finally {
      setBuilderLoading(false);
    }
  };

  // Derived Summary Metrics
  const totalSops = sops.length;
  const publishedSops = sops.filter(s => (s.content?.status || 'published') === 'published').length;
  const draftSops = sops.filter(s => s.content?.status === 'draft').length;

  // Extract unique categories for toolbar filter dropdown
  const availableCategories = Array.from(new Set(sops.map(s => s.category).filter(Boolean)));

  // Filter & Sort Logic
  const filteredSops = sops.filter(sop => {
    const matchesSearch = !searchQuery.trim() || 
      sop.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (sop.category && sop.category.toLowerCase().includes(searchQuery.toLowerCase()));

    const status = sop.content?.status || 'published';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    const matchesCategory = categoryFilter === 'all' || sop.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const sortedSops = [...filteredSops].sort((a, b) => {
    if (sortBy === 'updated_desc') {
      return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    } else if (sortBy === 'created_desc') {
      return new Date(b.created_at) - new Date(a.created_at);
    } else if (sortBy === 'created_asc') {
      return new Date(a.created_at) - new Date(b.created_at);
    } else if (sortBy === 'title_asc') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Pagination Slice
  const totalResults = sortedSops.length;
  const totalPages = Math.ceil(totalResults / pageSize) || 1;
  const paginatedSops = sortedSops.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCategoryFilter('all');
    setSortBy('updated_desc');
    setCurrentPage(1);
  };

  const isFilterActive = searchQuery || statusFilter !== 'all' || categoryFilter !== 'all' || sortBy !== 'updated_desc';

  // Real-time Sidebar Step Metrics
  const validStepCount = steps.filter(s => s.description.trim() !== '').length;
  const photoEvidenceStepCount = steps.filter(s => s.requiresPhoto && s.description.trim() !== '').length;

  return (
    <div className="sop-library-container">
      {/* 1. Page Header */}
      <div className="sop-header-section">
        <div className="sop-header-left">
          <h1 className="sop-page-title">SOP Library</h1>
          <p className="sop-page-subtitle">Create, manage, assign, and run your organization’s standard procedures.</p>
        </div>
        {isAdmin && (
          <button className="btn-primary create-sop-btn" onClick={() => openBuilder()}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create SOP
          </button>
        )}
      </div>

      {/* 2. Compact Summary Cards Grid */}
      <div className="sop-summary-cards">
        <div className="sop-summary-card">
          <div className="card-icon-box icon-blue">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Total SOPs</span>
            <span className="card-value">{totalSops}</span>
            <span className="card-sub text-muted">Active library</span>
          </div>
        </div>

        <div className="sop-summary-card">
          <div className="card-icon-box icon-green">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Published</span>
            <span className="card-value">{publishedSops}</span>
            <span className="card-sub text-green">Ready for execution</span>
          </div>
        </div>

        <div className="sop-summary-card">
          <div className="card-icon-box icon-yellow">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </div>
          <div className="card-info">
            <span className="card-label">Drafts</span>
            <span className="card-value">{draftSops}</span>
            <span className="card-sub text-yellow">Work in progress</span>
          </div>
        </div>
      </div>

      {/* 3. Search, Filter, and Sort Toolbar */}
      <div className="sop-toolbar">
        <div className="search-input-wrapper">
          <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 16, height: 16 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input 
            type="text" 
            className="toolbar-search-input" 
            placeholder="Search by SOP title or category..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')} title="Clear search">&times;</button>
          )}
        </div>

        <div className="toolbar-filters">
          <select 
            className="toolbar-select" 
            value={statusFilter} 
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            aria-label="Filter by Status"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>

          {availableCategories.length > 0 && (
            <select 
              className="toolbar-select" 
              value={categoryFilter} 
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              aria-label="Filter by Category"
            >
              <option value="all">All Categories</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          <select 
            className="toolbar-select" 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort SOPs"
          >
            <option value="updated_desc">Recently Updated</option>
            <option value="created_desc">Newest Created</option>
            <option value="created_asc">Oldest Created</option>
            <option value="title_asc">Alphabetical (A-Z)</option>
          </select>

          {isFilterActive && (
            <button className="btn-secondary compact-btn" onClick={handleClearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* 4. Error Banner */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 20 }}>
          <span>{error}</span>
          <button className="btn-secondary compact-btn" onClick={fetchSops} style={{ marginLeft: 12 }}>
            Retry Loading
          </button>
        </div>
      )}

      {/* 5. Skeleton Loading State */}
      {loading ? (
        <div className="sop-grid">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className="sop-card-skeleton">
              <div className="skeleton-line title" />
              <div className="skeleton-line short" />
              <div className="skeleton-line full" />
            </div>
          ))}
        </div>
      ) : paginatedSops.length === 0 ? (
        /* Empty State */
        <div className="sop-empty-state">
          <div className="empty-state-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: 32, height: 32 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="empty-title">{isFilterActive ? 'No SOPs match the selected filters' : 'No SOP templates available'}</h3>
          <p className="empty-desc">
            {isFilterActive 
              ? 'Try adjusting your search criteria or clearing active status and category filters.' 
              : 'Create your organization\'s first standard operating procedure to get started.'}
          </p>
          {isFilterActive ? (
            <button className="btn-secondary" onClick={handleClearFilters} style={{ marginTop: 12 }}>
              Clear Filters
            </button>
          ) : isAdmin && (
            <button className="btn-primary" onClick={() => openBuilder()} style={{ marginTop: 12 }}>
              + Create First SOP
            </button>
          )}
        </div>
      ) : (
        /* 6. SOP Cards Grid */
        <div className="sop-grid">
          {paginatedSops.map(sop => {
            const status = sop.content?.status || 'published';
            const stepCount = (sop.content?.steps || []).length;
            const desc = sop.content?.description || '';

            return (
              <div 
                key={sop.id} 
                className="sop-card" 
                onClick={() => openBuilder(sop)}
                tabIndex={0}
                role="button"
                aria-label={`SOP: ${sop.title}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openBuilder(sop);
                  }
                }}
              >
                <div className="sop-card-header">
                  <span className="sop-category">{sop.category || 'General'}</span>
                  <div className="sop-header-actions" onClick={(e) => e.stopPropagation()}>
                    <span className={`status-badge status-${status}`}>
                      <span className="status-dot" />
                      {status}
                    </span>
                    {isAdmin && (
                      <button
                        className="btn-delete-sop"
                        title="Delete SOP"
                        onClick={(e) => handleOpenDeleteModal(sop, e)}
                        aria-label={`Delete ${sop.title}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" style={{ width: 16, height: 16 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="sop-title">{sop.title}</h3>
                
                {desc && (
                  <p className="sop-description-preview">{desc}</p>
                )}

                <div className="sop-meta">
                  <div className="meta-item" title="Version">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" style={{ width: 14, height: 14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                    v{sop.version}
                  </div>
                  <div className="meta-item" title="Checklist steps">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" style={{ width: 14, height: 14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />
                    </svg>
                    {stepCount} {stepCount === 1 ? 'step' : 'steps'}
                  </div>
                  <div className="meta-item" title="Last updated">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" style={{ width: 14, height: 14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {new Date(sop.updated_at || sop.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div className="sop-card-actions" onClick={(e) => e.stopPropagation()}>
                  {isAuditor ? (
                    <button 
                      className="btn-secondary sop-card-btn" 
                      onClick={() => setActiveRunSopId(sop.id)}
                    >
                      View SOP Steps
                    </button>
                  ) : !isAdmin ? (
                    <button 
                      className="btn-primary sop-card-btn" 
                      onClick={() => setActiveRunSopId(sop.id)}
                    >
                      Run Checklist
                    </button>
                  ) : (
                    <div className="admin-action-row">
                      <button 
                        className="btn-secondary sop-card-btn" 
                        onClick={() => openBuilder(sop)}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn-primary sop-card-btn" 
                        onClick={() => handleOpenAssignModal(sop)}
                      >
                        Assign
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 7. Pagination Controls */}
      {totalPages > 1 && (
        <div className="sop-pagination">
          <span className="pagination-info">
            Showing <strong>{(currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, totalResults)}</strong> of <strong>{totalResults}</strong> procedures
          </span>
          <div className="pagination-buttons">
            <button 
              className="btn-secondary compact-btn" 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              &larr; Previous
            </button>
            <span className="page-indicator">Page {currentPage} of {totalPages}</span>
            <button 
              className="btn-secondary compact-btn" 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              Next &rarr;
            </button>
          </div>
        </div>
      )}

      {/* 8. CREATE / EDIT SOP BUILDER OVERLAY */}
      {isBuilderOpen && (
        <div className="builder-overlay">
          {/* Sticky Top Header */}
          <div className="builder-sticky-header">
            <div className="builder-header-left">
              <button className="btn-back" onClick={closeBuilder} title="Back to SOP Library">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                <span>Library</span>
              </button>
              <div className="builder-title-badge-group">
                <h2 className="builder-header-title">{currentSopId ? `Edit SOP` : 'Create New SOP'}</h2>
                <span className={`status-badge status-${initialStatus}`}>
                  <span className="status-dot" />
                  {initialStatus}
                </span>
                {isFormDirty && (
                  <span className="dirty-badge" title="You have unsaved changes">
                    • Unsaved changes
                  </span>
                )}
              </div>
            </div>

            <div className="builder-header-actions">
              <button 
                className="btn-secondary" 
                onClick={() => handleSave('draft')} 
                disabled={builderLoading}
              >
                {builderLoading ? 'Saving...' : 'Save Draft'}
              </button>
              <button 
                className="btn-primary" 
                onClick={() => handleSave('published')} 
                disabled={builderLoading}
              >
                {builderLoading ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>

          {/* Builder Body (2-Column Grid on Desktop) */}
          <div className="builder-body">
            <div className="builder-layout-container">
              
              {/* Main Left Column (70%) */}
              <div className="builder-main-column">
                {builderError && (
                  <div className="error-banner" style={{ marginBottom: 20 }}>
                    <span>{builderError}</span>
                  </div>
                )}

                {/* SOP Details Card */}
                <div className="editor-card">
                  <div className="editor-card-header">
                    <h3 className="editor-card-title">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18, color: 'var(--primary)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      SOP Details
                    </h3>
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      SOP Title <span className="required-asterisk">*</span>
                    </label>
                    <input 
                      type="text" 
                      className={`input-field ${validationErrors.title ? 'field-error' : ''}`} 
                      placeholder="e.g. Daily Equipment Inspection & Opening Procedure"
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); setIsFormDirty(true); }}
                    />
                    {validationErrors.title && (
                      <span className="field-error-text">{validationErrors.title}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Category <span className="required-asterisk">*</span>
                    </label>
                    <select 
                      className={`input-field ${validationErrors.category ? 'field-error' : ''}`}
                      value={category}
                      onChange={(e) => { setCategory(e.target.value); setIsFormDirty(true); }}
                    >
                      {PRESET_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                      <option value="Other">Custom Category...</option>
                    </select>

                    {category === 'Other' && (
                      <input 
                        type="text" 
                        className={`input-field ${validationErrors.category ? 'field-error' : ''}`}
                        style={{ marginTop: 10 }}
                        placeholder="Enter custom category name..."
                        value={customCategory}
                        onChange={(e) => { setCustomCategory(e.target.value); setIsFormDirty(true); }}
                      />
                    )}
                    {validationErrors.category && (
                      <span className="field-error-text">{validationErrors.category}</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description / Purpose</label>
                    <textarea 
                      className="input-field" 
                      rows="3"
                      placeholder="Provide background context or operational requirements for this procedure..."
                      value={description}
                      onChange={(e) => { setDescription(e.target.value); setIsFormDirty(true); }}
                    />
                    <span className="form-helper-text">Optional summary shown on library cards.</span>
                  </div>
                </div>

                {/* Checklist Steps Card */}
                <div className="editor-card">
                  <div className="editor-card-header">
                    <h3 className="editor-card-title">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: 18, height: 18, color: 'var(--primary)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />
                      </svg>
                      Checklist Steps <span className="required-asterisk">*</span>
                    </h3>
                    <span className="step-counter-badge">{steps.length} {steps.length === 1 ? 'Step' : 'Steps'}</span>
                  </div>

                  {validationErrors.steps && (
                    <div className="error-banner" style={{ marginBottom: 16 }}>
                      <span>{validationErrors.steps}</span>
                    </div>
                  )}

                  <div className="step-list">
                    {steps.map((step, idx) => (
                      <div key={idx} className="step-card-item">
                        <div className="step-card-header-row">
                          <div className="step-number-pill">
                            Step {idx + 1}
                          </div>

                          <div className="step-reorder-actions">
                            <button 
                              type="button"
                              className="btn-step-order" 
                              disabled={idx === 0} 
                              onClick={() => handleMoveStepUp(idx)}
                              title="Move step up"
                            >
                              &uarr;
                            </button>
                            <button 
                              type="button"
                              className="btn-step-order" 
                              disabled={idx === steps.length - 1} 
                              onClick={() => handleMoveStepDown(idx)}
                              title="Move step down"
                            >
                              &darr;
                            </button>
                            <button 
                              type="button"
                              className="btn-icon-danger" 
                              onClick={() => handleRemoveStep(idx)}
                              title="Delete Step"
                              aria-label={`Delete Step ${idx + 1}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" style={{ width: 16, height: 16 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        <textarea 
                          ref={idx === steps.length - 1 ? lastStepRef : null}
                          className="input-field step-textarea" 
                          rows="2"
                          placeholder="Describe the instructions for this step in detail..."
                          value={step.description}
                          onChange={(e) => handleStepChange(idx, 'description', e.target.value)}
                        />

                        {/* Photo Evidence Switch Control */}
                        <div className="step-evidence-box">
                          <label className="toggle-switch-label">
                            <input 
                              type="checkbox" 
                              className="toggle-checkbox"
                              checked={step.requiresPhoto}
                              onChange={(e) => handleStepChange(idx, 'requiresPhoto', e.target.checked)}
                            />
                            <span className="toggle-switch-slider" />
                            <span className="toggle-text">Require photo evidence for this step</span>
                          </label>
                          <span className="evidence-helper-text">
                            The operator must upload a photo before marking this step as completed.
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="btn-secondary add-step-btn" onClick={handleAddStep}>
                    + Add Checklist Step
                  </button>
                </div>
              </div>

              {/* Sidebar Right Column (30%) */}
              <div className="builder-sidebar-column">
                <div className="editor-card sticky-sidebar-card">
                  <h4 className="sidebar-card-title">SOP Summary & Guidance</h4>
                  
                  <div className="sidebar-summary-list">
                    <div className="summary-item">
                      <span className="summary-label">Status</span>
                      <span className={`status-badge status-${initialStatus}`}>
                        {initialStatus}
                      </span>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Target Version</span>
                      <span className="summary-val">{currentSopId ? 'Increments on Save' : 'v1'}</span>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Valid Steps</span>
                      <span className="summary-val">{validStepCount} / {steps.length}</span>
                    </div>

                    <div className="summary-item">
                      <span className="summary-label">Photo Evidence Steps</span>
                      <span className="summary-val">{photoEvidenceStepCount}</span>
                    </div>
                  </div>

                  <hr className="sidebar-divider" />

                  <h5 className="sidebar-sub-title">Publishing Validation</h5>
                  <ul className="validation-checklist">
                    <li className={title.trim() ? 'valid' : 'pending'}>
                      <span className="check-dot" /> Title specified
                    </li>
                    <li className={(category === 'Other' ? customCategory.trim() : category) ? 'valid' : 'pending'}>
                      <span className="check-dot" /> Category assigned
                    </li>
                    <li className={validStepCount > 0 ? 'valid' : 'pending'}>
                      <span className="check-dot" /> At least 1 step instruction
                    </li>
                  </ul>

                  <div className="guidance-box">
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      <strong>Drafts</strong> allow saving partial work. <strong>Publishing</strong> makes the procedure instantly available to operators.
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 9. Active Checklist Run Screen Overlay */}
      {activeRunSopId && (
        <ChecklistRun 
          sopId={activeRunSopId} 
          token={token} 
          decoded={decoded}
          onClose={() => setActiveRunSopId(null)} 
        />
      )}

      {/* 10. Assign SOP Modal */}
      {assigningSop && (
        <div className="modal-backdrop" onClick={handleCloseAssignModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Assign SOP</h2>
              <button className="btn-close" onClick={handleCloseAssignModal}>&times;</button>
            </div>
            
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>
                Assign <strong>"{assigningSop.title}"</strong> to an employee for execution.
              </p>
              
              {assignError && (
                <div className="error-banner" style={{ marginBottom: 16, fontSize: 13 }}>
                  <span>{assignError}</span>
                </div>
              )}

              {assignSuccess && (
                <div className="success-banner" style={{ marginBottom: 16, fontSize: 13, background: 'var(--success-bg)', color: 'var(--success)', padding: '10px 14px', borderRadius: 'var(--radius)' }}>
                  <span>{assignSuccess}</span>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Select Employee</label>
                <select 
                  className="input-field" 
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  disabled={assignLoading}
                >
                  <option value="">-- Select an active employee --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.username} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
                <button 
                  className="btn-secondary" 
                  onClick={handleCloseAssignModal} 
                  disabled={assignLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary" 
                  onClick={handleAssignSubmit} 
                  disabled={assignLoading || !selectedEmployeeId}
                >
                  {assignLoading ? 'Assigning...' : 'Assign SOP'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. Delete Confirmation Modal */}
      {deletingSop && (
        <div className="modal-backdrop" onClick={() => setDeletingSop(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 style={{ color: 'var(--error)' }}>Delete SOP Template?</h2>
              <button className="btn-close" onClick={() => setDeletingSop(null)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <p style={{ fontSize: 14, color: 'var(--text-h)', marginBottom: 12 }}>
                Are you sure you want to delete <strong>"{deletingSop.title}"</strong>?
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                This action is permanent and cannot be undone. All active versions will be deleted.
              </p>

              <div className="modal-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  className="btn-secondary" 
                  onClick={() => setDeletingSop(null)} 
                  disabled={deleteLoading}
                >
                  Cancel
                </button>
                <button 
                  className="btn-primary" 
                  style={{ background: 'var(--error)', borderColor: 'var(--error)' }}
                  onClick={handleConfirmDelete} 
                  disabled={deleteLoading}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete SOP'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SopLibrary;
