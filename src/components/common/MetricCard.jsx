import React from 'react'

function Metric({ label, value, icon }) { return <div className="metric-card card"><span className="metric-icon">{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div> }

export default Metric

