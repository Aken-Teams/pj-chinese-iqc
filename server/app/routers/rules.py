from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.review import ReviewRule
from app.schemas.rules import ReviewRuleCreate, ReviewRuleUpdate, ReviewRuleResponse

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[ReviewRuleResponse])
def list_rules(product_id: int = Query(...), db: Session = Depends(get_db)):
    return (
        db.query(ReviewRule)
        .filter(ReviewRule.product_id == product_id)
        .order_by(ReviewRule.param_name)
        .all()
    )


@router.post("", response_model=ReviewRuleResponse)
def create_rule(req: ReviewRuleCreate, db: Session = Depends(get_db)):
    rule = ReviewRule(**req.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=ReviewRuleResponse)
def update_rule(rule_id: int, req: ReviewRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(ReviewRule).filter(ReviewRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(ReviewRule).filter(ReviewRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True}
