from adapters.appen import AppenAdapter
from adapters.base import BaseAdapter
from adapters.coconala import CoconalaAdapter
from adapters.crowdworks import CrowdWorksAdapter
from adapters.dataannotation import DataAnnotationAdapter
from adapters.fiverr import FiverrAdapter
from adapters.freelancer_com import FreelancerComAdapter
from adapters.lancers import LancersAdapter
from adapters.remotasks import RemotasksAdapter
from adapters.scale_ai import ScaleAIAdapter
from adapters.upwork import UpworkAdapter

__all__ = [
    "BaseAdapter",
    "UpworkAdapter",
    "CrowdWorksAdapter",
    "LancersAdapter",
    "FreelancerComAdapter",
    "FiverrAdapter",
    "CoconalaAdapter",
    "ScaleAIAdapter",
    "DataAnnotationAdapter",
    "RemotasksAdapter",
    "AppenAdapter",
]
