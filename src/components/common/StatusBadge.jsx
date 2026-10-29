import React from 'react'
import { STATUS } from '../../utils/appointment.js'

function Status({ value }) { return <span className={`status-badge ${value}`}>{STATUS[value] || value}</span> }

export default Status

