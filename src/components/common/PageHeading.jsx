import React from 'react'

function PageHeading({ eyebrow, title, description, icon }) {
  return <div className="page-heading">
    <div className="heading-icon">{icon}</div>
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>
  </div>
}

export default PageHeading

